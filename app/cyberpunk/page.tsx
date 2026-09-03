"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatWhen } from "@/lib/format";

type LookupHit = {
  queried: string;
  bucket: "has_result" | "harmonic_found" | "unrecognized";
  guardianId?: string;
  matchedName?: string;
  updatedAt?: string;
  thumbUrl?: string | null;
  attioId?: string;
  resultBase64?: string;
  rawBase64?: string;
};

function parseNames(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean))];
}

// Guards against burning a generation call on a garbled filename (phone
// export IDs, "IMG_1234", timestamps, etc.) — anything that doesn't look
// like a plausible person's name gets flagged for confirmation instead of
// silently processed.
function looksLikePersonName(name: string): boolean {
  const letters = name.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length < 2) return false;
  const digitRatio = (name.match(/\d/g) ?? []).length / name.length;
  if (digitRatio > 0.3) return false;
  if (/^(img|dsc|photo|image|screenshot|whatsapp|pxl|copy of)[\s_-]?\d*$/i.test(name.trim())) return false;
  return true;
}

// Proper CSV parsing (quoted-field aware) that only pulls the identifying
// name column — a roster with "Name, Job Title, Country, ..." columns
// should not turn "Job Title" or "Germany" into names to look up.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

const NAME_HEADER_LABELS = ["name", "full name", "guardian", "guardian name", "person"];

function extractNamesFromCsv(text: string): string[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const firstRowLower = rows[0].map((c) => c.toLowerCase());
  const nameColIndex = firstRowLower.findIndex((c) => NAME_HEADER_LABELS.includes(c));
  const hasHeader = nameColIndex >= 0 || (rows[0].length > 1 && firstRowLower.some((c) => c === "job title" || c === "country" || c === "company"));

  const col = nameColIndex >= 0 ? nameColIndex : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return [...new Set(dataRows.map((r) => (r[col] ?? "").trim()).filter(Boolean))];
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
}

type Suggestion = { id: string; name: string; updatedAt: string; thumbUrl: string | null };

export default function CyberpunkModule() {
  const [lookupInput, setLookupInput] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupHit[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // Live suggestions while typing a single name (no comma/newline yet) —
  // matches anywhere in the full name, so both first and last names work.
  useEffect(() => {
    const isSingleTerm = lookupInput.trim() && !/[,\n]/.test(lookupInput);
    if (!isSingleTerm || lookupResults !== null) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/guardians/search?q=${encodeURIComponent(lookupInput.trim())}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => setSuggestions((data.results ?? []).slice(0, 30)))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [lookupInput, lookupResults]);

  function pickSuggestion(s: Suggestion) {
    setLookupInput(s.name);
    setSuggestions([]);
    setLookupResults([
      { queried: s.name, bucket: "has_result", guardianId: s.id, matchedName: s.name, updatedAt: s.updatedAt, thumbUrl: s.thumbUrl },
    ]);
  }

  async function runLookup(namesOverride?: string[]) {
    const names = namesOverride ?? parseNames(lookupInput);
    if (names.length === 0) {
      setLookupResults(null);
      return;
    }
    setLookingUp(true);
    try {
      const res = await fetch("/api/guardians/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      setLookupResults(data.results ?? []);
    } finally {
      setLookingUp(false);
    }
  }

  function clearLookup() {
    setLookupInput("");
    setLookupResults(null);
  }

  function updateLookupHit(queried: string, changes: Partial<LookupHit>) {
    setLookupResults((prev) => (prev ?? []).map((r) => (r.queried === queried ? { ...r, ...changes } : r)));
  }

  // A "no picture on file" name that just got uploaded + approved (or a
  // Harmonic-sourced preview that got confirmed) moves into the found
  // list so it shows up alongside the rest of this search and is
  // included in bulk download.
  function resolveMissing(queried: string, resolved: Omit<LookupHit, "queried" | "bucket">) {
    updateLookupHit(queried, { ...resolved, bucket: "has_result" });
  }

  const found = lookupResults?.filter((r) => r.bucket === "has_result") ?? [];
  const harmonicFound = lookupResults?.filter((r) => r.bucket === "harmonic_found") ?? [];
  const missing = lookupResults?.filter((r) => r.bucket === "unrecognized") ?? [];

  async function downloadZip() {
    const ids = found.map((r) => r.guardianId!).filter(Boolean);
    const res = await fetch("/api/guardians/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guardians.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
          ← PixelPunk
        </Link>
        <Link
          href="/cyberpunk/database"
          className="rounded-md border border-[#2a1e42] px-3 py-1.5 font-mono text-xs text-white hover:border-[#d4367a]"
        >
          Database →
        </Link>
      </div>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Guardian Portraits
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Cyberpunk</h1>

      <div className="relative mt-6">
        <div className="rounded-lg border border-[#2a1e42] bg-[#16112c] p-3">
          <textarea
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (suggestions.length > 0) pickSuggestion(suggestions[0]);
                else runLookup();
              }
            }}
            placeholder="Type or paste one or more names, separated by commas or new lines…"
            rows={2}
            className="w-full resize-none bg-transparent text-sm text-white placeholder:text-[#6b5f8a] focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            {lookupResults !== null && (
              <button onClick={clearLookup} className="rounded-md px-3 py-1.5 font-mono text-xs text-[#8b7ba8] hover:text-white">
                Clear
              </button>
            )}
            <button
              onClick={() => runLookup()}
              disabled={lookingUp || !lookupInput.trim()}
              className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e0447f] disabled:opacity-50"
            >
              {lookingUp ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border border-[#2a1e42] bg-[#16112c] shadow-lg">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => pickSuggestion(s)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[#1a1030]"
              >
                {s.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbUrl} alt={s.name} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-[#2a1e42]" />
                )}
                <span className="text-sm text-white">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <UploadZone onNamesFromCsv={(names) => runLookup(names)} />

      {lookupResults !== null && (
        <div className="mt-8 space-y-8">
          {found.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                  {found.length} found
                </p>
                {found.length > 1 && (
                  <button
                    onClick={downloadZip}
                    className="rounded-md border border-[#2a1e42] px-3 py-1.5 font-mono text-xs text-white hover:border-[#d4367a]"
                  >
                    Download all (.zip)
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-3">
                {found.map((r) => (
                  <FoundCard key={r.guardianId} hit={r} single={found.length === 1} />
                ))}
              </div>
            </div>
          )}

          {harmonicFound.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                {harmonicFound.length} found via Harmonic
              </p>
              <p className="mt-1 text-xs text-[#6b5f8a]">
                Not in our database, but Harmonic had a photo — already cyberpunked below. Confirm it&rsquo;s really
                them before adding.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {harmonicFound.map((r) => (
                  <HarmonicFoundCard
                    key={r.queried}
                    hit={r}
                    onResolved={(resolved) => resolveMissing(r.queried, resolved)}
                    onDiscarded={() =>
                      updateLookupHit(r.queried, {
                        bucket: "unrecognized",
                        resultBase64: undefined,
                        rawBase64: undefined,
                        attioId: undefined,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                {missing.length} with no picture on file
              </p>
              <p className="mt-1 text-xs text-[#6b5f8a]">
                Upload a raw photo for each to generate their cyberpunk portrait.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {missing.map((r) => (
                  <MissingCard key={r.queried} name={r.queried} onResolved={(resolved) => resolveMissing(r.queried, resolved)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type QueueItem = {
  key: string;
  name: string;
  file: File;
  status: "needs_review" | "duplicate_review" | "queued" | "processing" | "preview" | "approved" | "error";
  previewBase64?: string;
  rawBase64?: string;
  error?: string;
  existingThumbUrl?: string;
  guardianId?: string;
};

function UploadZone({ onNamesFromCsv }: { onNamesFromCsv: (names: string[]) => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  async function handleFiles(fileList: FileList) {
    const files = [...fileList];
    const textFiles = files.filter((f) => /\.(csv|txt)$/i.test(f.name));
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));

    for (const f of textFiles) {
      const text = await f.text();
      const names = /\.csv$/i.test(f.name) ? extractNamesFromCsv(text) : parseNames(text);
      onNamesFromCsv(names);
    }

    if (imageFiles.length > 0) {
      const newItems: QueueItem[] = await Promise.all(
        imageFiles.map(async (file) => {
          const name = file.name.replace(/\.[^.]+$/, "");
          const key = `${file.name}-${file.lastModified}-${Math.random()}`;
          if (!looksLikePersonName(name)) {
            return { key, name, file, status: "needs_review" as const };
          }
          // Does this name already have a photo? A bulk upload has no
          // side-by-side view to notice an accidental overwrite, so flag
          // it explicitly rather than silently versioning them.
          try {
            const res = await fetch(`/api/guardians/exists?name=${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.exists) {
              return { key, name, file, status: "duplicate_review" as const, existingThumbUrl: data.thumbUrl };
            }
          } catch {
            // if the check itself fails, don't block the upload over it
          }
          return { key, name, file, status: "queued" as const };
        })
      );
      setQueue((q) => [...q, ...newItems]);
    }
  }

  function confirmName(item: QueueItem, name: string) {
    setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, name, status: "queued" } : i)));
  }

  function proceedAnyway(item: QueueItem) {
    setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, status: "queued" } : i)));
  }

  useEffect(() => {
    if (processingRef.current) return;
    const next = queue.find((i) => i.status === "queued");
    if (!next) return;
    processingRef.current = true;

    (async () => {
      setQueue((q) => q.map((i) => (i.key === next.key ? { ...i, status: "processing" } : i)));
      try {
        const form = new FormData();
        form.set("name", next.name);
        form.set("file", next.file);
        const res = await fetch("/api/guardians/generate", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Generation failed");
        setQueue((q) =>
          q.map((i) =>
            i.key === next.key
              ? { ...i, status: "preview", previewBase64: data.resultBase64, rawBase64: data.rawBase64 }
              : i
          )
        );
      } catch (err) {
        setQueue((q) =>
          q.map((i) =>
            i.key === next.key ? { ...i, status: "error", error: err instanceof Error ? err.message : "Failed" } : i
          )
        );
      } finally {
        processingRef.current = false;
      }
    })();
  }, [queue]);

  async function approve(item: QueueItem) {
    if (!item.previewBase64) return;
    const res = await fetch("/api/guardians/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: item.name, resultBase64: item.previewBase64, rawBase64: item.rawBase64 }),
    });
    const data = await res.json();
    setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, status: "approved", guardianId: data.guardianId } : i)));
  }

  function discard(item: QueueItem) {
    setQueue((q) => q.filter((i) => i.key !== item.key));
  }

  const queuedCount = queue.filter((i) => i.status === "queued" || i.status === "processing").length;
  const approvedItems = queue.filter((i) => i.status === "approved");

  async function downloadApprovedZip() {
    const ids = approvedItems.map((i) => i.guardianId!).filter(Boolean);
    const res = await fetch("/api/guardians/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guardians.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center text-sm transition ${
          dragOver ? "border-[#d4367a] bg-[#1a1030]" : "border-[#2a1e42] text-[#8b7ba8]"
        }`}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#6b5f8a]">
          <path
            d="M12 15V3m0 0L7 8m5-5l5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-base font-medium text-white">Drop raw photos here, or click to choose files</p>
        <p className="mt-1 max-w-md text-xs text-[#6b5f8a]">
          Name each photo after the guardian (e.g. &ldquo;Jane Doe.jpg&rdquo;) — or drop a .csv / .txt of names to check
          status, no files needed.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <WarningBox>Name files exactly as the guardian — wrong names make duplicates and waste a generation.</WarningBox>

      {queuedCount > 0 && (
        <p className="mt-2 font-mono text-xs text-[#6b5f8a]">Processing {queuedCount} remaining…</p>
      )}

      {queue.filter((i) => i.status !== "approved").length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {queue
            .filter((i) => i.status !== "approved")
            .map((item) => (
              <div key={item.key} className="rounded-lg border border-[#2a1e42] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <button onClick={() => discard(item)} className="font-mono text-xs text-[#8b7ba8] hover:text-white">
                    Remove
                  </button>
                </div>
                {item.status === "needs_review" && (
                  <NeedsReviewRow item={item} onConfirm={(name) => confirmName(item, name)} />
                )}
                {item.status === "duplicate_review" && (
                  <DuplicateReviewRow item={item} onProceed={() => proceedAnyway(item)} onSkip={() => discard(item)} />
                )}
                {item.status === "queued" && <p className="mt-1 text-xs text-[#6b5f8a]">Queued…</p>}
                {item.status === "processing" && <p className="mt-1 text-xs text-[#6b5f8a]">Generating…</p>}
                {item.status === "error" && <p className="mt-1 text-xs text-[#ff6b8f]">{item.error}</p>}
                {item.status === "preview" && item.previewBase64 && (
                  <PreviewApprove
                    previewBase64={item.previewBase64}
                    onApprove={() => approve(item)}
                    onDiscard={() => discard(item)}
                    onRefine={async (instruction) => {
                      const currentBase64 = item.previewBase64!;
                      const res = await fetch("/api/guardians/edit-preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ imageBase64: currentBase64, instruction }),
                      });
                      const data = await res.json();
                      if (data.resultBase64) {
                        setQueue((q) =>
                          q.map((i) => (i.key === item.key ? { ...i, previewBase64: data.resultBase64 } : i))
                        );
                      }
                    }}
                  />
                )}
              </div>
            ))}
        </div>
      )}

      {approvedItems.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
              {approvedItems.length} retrofied
            </p>
            {approvedItems.length > 1 && (
              <button
                onClick={downloadApprovedZip}
                className="rounded-md border border-[#2a1e42] px-3 py-1.5 font-mono text-xs text-white hover:border-[#d4367a]"
              >
                Download all (.zip)
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-col divide-y divide-[#2a1e42] rounded-lg border border-[#2a1e42]">
            {approvedItems.map((item) => (
              <div key={item.key} className="flex items-center gap-4 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${item.previewBase64}`}
                  alt={item.name}
                  className="h-12 w-12 rounded-full object-cover"
                />
                <p className="flex-1 text-sm font-medium text-white">{item.name}</p>
                <a
                  href={`data:image/png;base64,${item.previewBase64}`}
                  download={`${item.name}.png`}
                  className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-[#ff6b8f]/40 bg-[#2a1215] px-3 py-2 text-xs text-[#ff6b8f]">
      <span>⚠️</span>
      <span>{children}</span>
    </div>
  );
}

function DuplicateReviewRow({
  item,
  onProceed,
  onSkip,
}: {
  item: QueueItem;
  onProceed: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mt-2">
      <WarningBox>
        <span className="text-white">{item.name}</span> already has a photo — this will replace their current
        version.
      </WarningBox>
      <div className="mt-2 flex items-center gap-4">
        {item.existingThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.existingThumbUrl} alt={item.name} className="h-12 w-12 rounded-full object-cover" />
        )}
        <div className="flex gap-2">
          <button onClick={onProceed} className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white">
            Replace anyway
          </button>
          <button onClick={onSkip} className="rounded-md border border-[#2a1e42] px-3 py-1.5 text-xs text-white">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function NeedsReviewRow({ item, onConfirm }: { item: QueueItem; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(item.name);

  return (
    <div className="mt-2">
      <WarningBox>&ldquo;{item.file.name}&rdquo; doesn&rsquo;t look like a name — confirm before processing.</WarningBox>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-[#2a1e42] bg-[#0f0a1f] px-3 py-2 text-sm text-white focus:border-[#d4367a] focus:outline-none"
        />
        <button
          onClick={() => onConfirm(name)}
          disabled={!name.trim()}
          className="rounded-md bg-[#d4367a] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          Looks good — process
        </button>
      </div>
    </div>
  );
}

function PreviewApprove({
  previewBase64,
  onApprove,
  onDiscard,
  onRefine,
}: {
  previewBase64: string;
  onApprove: () => Promise<void> | void;
  onDiscard: () => void;
  onRefine: (instruction: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/png;base64,${previewBase64}`} alt="preview" className="h-40 w-40 rounded-lg object-cover" />
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ask for a change (optional)"
          className="flex-1 rounded-md border border-[#2a1e42] bg-[#0f0a1f] px-3 py-2 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
        />
        <button
          onClick={async () => {
            if (!instruction.trim()) return;
            setBusy(true);
            try {
              await onRefine(instruction);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !instruction.trim()}
          className="rounded-md border border-[#2a1e42] px-3 py-2 text-xs text-white disabled:opacity-50"
        >
          Regenerate
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await onApprove();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add to database
        </button>
        <button onClick={onDiscard} className="rounded-md border border-[#2a1e42] px-3 py-1.5 text-xs text-white">
          Discard
        </button>
      </div>
    </div>
  );
}

function FoundCard({ hit, single }: { hit: LookupHit; single: boolean }) {
  const [mode, setMode] = useState<null | "edit" | "replace">(null);
  const [instruction, setInstruction] = useState("");
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function askForChange() {
    if (!instruction.trim() || !hit.thumbUrl) return;
    setBusy(true);
    try {
      const currentBase64 = await urlToBase64(hit.thumbUrl);
      const res = await fetch("/api/guardians/edit-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: currentBase64, instruction }),
      });
      const data = await res.json();
      if (data.resultBase64) setPreviewBase64(data.resultBase64);
    } finally {
      setBusy(false);
    }
  }

  async function replaceWithFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("name", hit.matchedName ?? hit.queried);
      form.set("file", file);
      const res = await fetch("/api/guardians/generate", { method: "POST", body: form });
      const data = await res.json();
      if (data.resultBase64) {
        setPreviewBase64(data.resultBase64);
        setRawBase64(data.rawBase64 ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!previewBase64) return;
    setBusy(true);
    try {
      await fetch("/api/guardians/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hit.matchedName ?? hit.queried,
          resultBase64: previewBase64,
          rawBase64: rawBase64 ?? undefined,
          regenerationNote: instruction || undefined,
        }),
      });
      setPreviewBase64(null);
      setRawBase64(null);
      setInstruction("");
      setMode(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <div className="flex items-center gap-4">
        {hit.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hit.thumbUrl}
            alt={hit.matchedName}
            className={single ? "h-40 w-40 rounded-lg object-cover" : "h-12 w-12 rounded-full object-cover"}
          />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{hit.matchedName}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
            {hit.updatedAt ? formatWhen(hit.updatedAt) : ""}
          </p>
        </div>
        <div className="flex items-center divide-x divide-[#2a1e42]">
          {hit.thumbUrl && (
            <>
              <button onClick={() => setViewing(true)} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                View
              </button>
              <a href={hit.thumbUrl} download className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </>
          )}
          <button onClick={() => setMode(mode === "edit" ? null : "edit")} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
            Ask for a change
          </button>
          <button
            onClick={() => {
              setMode("replace");
              fileRef.current?.click();
            }}
            className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
          >
            Replace photo
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) replaceWithFile(f);
        }}
      />

      {mode === "edit" && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. make the skin tone brighter"
            className="flex-1 rounded-md border border-[#2a1e42] bg-[#0f0a1f] px-3 py-2 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
          />
          <button
            onClick={askForChange}
            disabled={busy || !instruction.trim()}
            className="rounded-md bg-[#d4367a] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      )}

      {previewBase64 && (
        <div className="mt-4 border-t border-[#2a1e42] pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
            Preview — nothing saved until you confirm
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${previewBase64}`} alt="preview" className="h-40 w-40 rounded-lg object-cover" />
          <div className="mt-3 flex gap-2">
            <button onClick={approve} disabled={busy} className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Add to database
            </button>
            <button
              onClick={() => {
                setPreviewBase64(null);
                setRawBase64(null);
              }}
              className="rounded-md border border-[#2a1e42] px-3 py-1.5 text-xs text-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {viewing && hit.thumbUrl && (
        <div
          onClick={() => setViewing(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <div onClick={(e) => e.stopPropagation()} className="relative max-w-lg">
            <button
              onClick={() => setViewing(false)}
              aria-label="Close"
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#16112c] text-white hover:bg-[#2a1e42]"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hit.thumbUrl} alt={hit.matchedName} className="max-h-[70vh] w-full rounded-lg object-contain" />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">{hit.matchedName}</p>
              <a href={hit.thumbUrl} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HarmonicFoundCard({
  hit,
  onResolved,
  onDiscarded,
}: {
  hit: LookupHit;
  onResolved: (resolved: { guardianId: string; matchedName: string; updatedAt: string; thumbUrl: string }) => void;
  onDiscarded: () => void;
}) {
  const [previewBase64, setPreviewBase64] = useState(hit.resultBase64!);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <p className="text-sm font-medium text-white">{hit.matchedName}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">via harmonic</p>
      <PreviewApprove
        previewBase64={previewBase64}
        onApprove={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/guardians/approve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: hit.matchedName,
                resultBase64: previewBase64,
                rawBase64: hit.rawBase64,
                attioId: hit.attioId,
              }),
            });
            const data = await res.json();
            onResolved({
              guardianId: data.guardianId,
              matchedName: hit.matchedName!,
              updatedAt: new Date().toISOString(),
              thumbUrl: `data:image/png;base64,${previewBase64}`,
            });
          } finally {
            setBusy(false);
          }
        }}
        onDiscard={onDiscarded}
        onRefine={async (instruction) => {
          const res = await fetch("/api/guardians/edit-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: previewBase64, instruction }),
          });
          const data = await res.json();
          if (data.resultBase64) setPreviewBase64(data.resultBase64);
        }}
      />
      {busy && <p className="mt-2 text-xs text-[#6b5f8a]">Saving…</p>}
    </div>
  );
}

function MissingCard({
  name,
  onResolved,
}: {
  name: string;
  onResolved: (resolved: { guardianId: string; matchedName: string; updatedAt: string; thumbUrl: string }) => void;
}) {
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("file", file);
      const res = await fetch("/api/guardians/generate", { method: "POST", body: form });
      const data = await res.json();
      if (data.resultBase64) {
        setPreviewBase64(data.resultBase64);
        setRawBase64(data.rawBase64 ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!previewBase64) return;
    setBusy(true);
    try {
      const res = await fetch("/api/guardians/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, resultBase64: previewBase64, rawBase64: rawBase64 ?? undefined }),
      });
      const data = await res.json();
      onResolved({
        guardianId: data.guardianId,
        matchedName: name,
        updatedAt: new Date().toISOString(),
        thumbUrl: `data:image/png;base64,${previewBase64}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <p className="text-sm font-medium text-white">{name}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">no picture on file</p>

      {!previewBase64 ? (
        <>
          <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[#2a1e42] py-6 text-xs text-[#8b7ba8] hover:border-[#d4367a]">
            {busy ? "Generating…" : "Upload raw photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) generate(f);
              }}
            />
          </label>
        </>
      ) : (
        <PreviewApprove
          previewBase64={previewBase64}
          onApprove={approve}
          onDiscard={() => {
            setPreviewBase64(null);
            setRawBase64(null);
          }}
          onRefine={async (instruction) => {
            const res = await fetch("/api/guardians/edit-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: previewBase64, instruction }),
            });
            const data = await res.json();
            if (data.resultBase64) setPreviewBase64(data.resultBase64);
          }}
        />
      )}
    </div>
  );
}
