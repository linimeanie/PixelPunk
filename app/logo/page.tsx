"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LookupHit = {
  queried: string;
  bucket: "has_result" | "auto_fetched" | "unrecognized";
  logoId?: string;
  matchedName?: string;
  updatedAt?: string;
  whiteUrl?: string | null;
  attioCompanyId?: string;
  whiteBase64?: string;
  originalBase64?: string;
};

function parseNames(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean))];
}

// Proper CSV parsing (quoted-field aware) that only pulls the identifying
// name column — a roster with "Company, Domain, Category, ..." columns
// should not turn "Domain" or "SaaS" into company names to look up.
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

const NAME_HEADER_LABELS = ["name", "company", "company name", "organisation", "organization", "partner"];

function extractNamesFromCsv(text: string): string[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const firstRowLower = rows[0].map((c) => c.toLowerCase());
  const nameColIndex = firstRowLower.findIndex((c) => NAME_HEADER_LABELS.includes(c));
  const hasHeader = nameColIndex >= 0 || (rows[0].length > 1 && firstRowLower.some((c) => c === "domain" || c === "category" || c === "website"));

  const col = nameColIndex >= 0 ? nameColIndex : 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return [...new Set(dataRows.map((r) => (r[col] ?? "").trim()).filter(Boolean))];
}

type Suggestion = { id: string; companyName: string; whiteUrl: string | null };

export default function LogoModule() {
  const [lookupInput, setLookupInput] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupHit[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const isSingleTerm = lookupInput.trim() && !/[,\n]/.test(lookupInput);
    if (!isSingleTerm || lookupResults !== null) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/logos/search?q=${encodeURIComponent(lookupInput.trim())}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) =>
          setSuggestions(
            (data.results ?? []).slice(0, 30).map((r: any) => ({ id: r.id, companyName: r.companyName, whiteUrl: r.whiteUrl }))
          )
        )
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [lookupInput, lookupResults]);

  function pickSuggestion(s: Suggestion) {
    setLookupInput(s.companyName);
    setSuggestions([]);
    setLookupResults([{ queried: s.companyName, bucket: "has_result", logoId: s.id, matchedName: s.companyName, whiteUrl: s.whiteUrl }]);
  }

  async function runLookup(namesOverride?: string[]) {
    const names = namesOverride ?? parseNames(lookupInput);
    if (names.length === 0) {
      setLookupResults(null);
      return;
    }
    setLookingUp(true);
    try {
      const res = await fetch("/api/logos/lookup", {
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

  function resolveMissing(queried: string, resolved: Omit<LookupHit, "queried" | "bucket">) {
    updateLookupHit(queried, { ...resolved, bucket: "has_result" });
  }

  const found = lookupResults?.filter((r) => r.bucket === "has_result") ?? [];
  const autoFetched = lookupResults?.filter((r) => r.bucket === "auto_fetched") ?? [];
  const missing = lookupResults?.filter((r) => r.bucket === "unrecognized") ?? [];

  async function downloadZip() {
    const ids = found.map((r) => r.logoId!).filter(Boolean);
    const res = await fetch("/api/logos/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logos.zip";
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
          href="/logo/database"
          className="rounded-md border border-[#2a1e42] px-3 py-1.5 font-mono text-xs text-white hover:border-[#d4367a]"
        >
          Database →
        </Link>
      </div>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Partner Marks
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Logo</h1>

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
            placeholder="Type or paste one or more company names, separated by commas or new lines…"
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
                {s.whiteUrl ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-[#1a1030]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.whiteUrl} alt={s.companyName} className="max-h-6 max-w-6" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded bg-[#2a1e42]" />
                )}
                <span className="text-sm text-white">{s.companyName}</span>
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
                  <FoundCard key={r.logoId} hit={r} single={found.length === 1} />
                ))}
              </div>
            </div>
          )}

          {autoFetched.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                {autoFetched.length} found via Attio
              </p>
              <p className="mt-1 text-xs text-[#6b5f8a]">
                Not in our database, but Attio had a logo — already converted below. Confirm it&rsquo;s the right mark
                before adding.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {autoFetched.map((r) => (
                  <AutoFetchedCard
                    key={r.queried}
                    hit={r}
                    onResolved={(resolved) => resolveMissing(r.queried, resolved)}
                    onDiscarded={() =>
                      updateLookupHit(r.queried, {
                        bucket: "unrecognized",
                        whiteBase64: undefined,
                        originalBase64: undefined,
                        attioCompanyId: undefined,
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
                {missing.length} with no logo on file
              </p>
              <p className="mt-1 text-xs text-[#6b5f8a]">
                Upload a raw logo for each to convert it to white/transparent.
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
  status: "duplicate_review" | "queued" | "processing" | "preview" | "approved" | "error";
  whiteBase64?: string;
  originalBase64?: string;
  error?: string;
  existingWhiteUrl?: string;
  logoId?: string;
};

function UploadZone({ onNamesFromCsv }: { onNamesFromCsv: (names: string[]) => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  async function handleFiles(fileList: FileList) {
    const files = [...fileList];
    const textFiles = files.filter((f) => /\.(csv|txt)$/i.test(f.name));
    const imageFiles = files.filter((f) => f.type.startsWith("image/") || /\.svg$/i.test(f.name));

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
          try {
            const res = await fetch(`/api/logos/exists?name=${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.exists) {
              return { key, name, file, status: "duplicate_review" as const, existingWhiteUrl: data.whiteUrl };
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
        form.set("companyName", next.name);
        form.set("file", next.file);
        const res = await fetch("/api/logos/generate", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Conversion failed");
        setQueue((q) =>
          q.map((i) =>
            i.key === next.key
              ? { ...i, status: "preview", whiteBase64: data.whiteBase64, originalBase64: data.originalBase64 }
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
    if (!item.whiteBase64 || !item.originalBase64) return;
    const res = await fetch("/api/logos/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: item.name, whiteBase64: item.whiteBase64, originalBase64: item.originalBase64 }),
    });
    const data = await res.json();
    setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, status: "approved", logoId: data.logoId } : i)));
  }

  function discard(item: QueueItem) {
    setQueue((q) => q.filter((i) => i.key !== item.key));
  }

  const queuedCount = queue.filter((i) => i.status === "queued" || i.status === "processing").length;
  const approvedItems = queue.filter((i) => i.status === "approved");

  async function downloadApprovedZip() {
    const ids = approvedItems.map((i) => i.logoId!).filter(Boolean);
    const res = await fetch("/api/logos/download-zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logos.zip";
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
        <p className="text-base font-medium text-white">Drop raw logos here, or click to choose files</p>
        <p className="mt-1 max-w-md text-xs text-[#6b5f8a]">
          Name each file after the company (e.g. &ldquo;Airbus.png&rdquo;) — or drop a .csv / .txt of company names to
          check status, no files needed.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.svg,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <WarningBox>Name files exactly as the company — wrong names make duplicates.</WarningBox>

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
                {item.status === "duplicate_review" && (
                  <DuplicateReviewRow item={item} onProceed={() => proceedAnyway(item)} onSkip={() => discard(item)} />
                )}
                {item.status === "queued" && <p className="mt-1 text-xs text-[#6b5f8a]">Queued…</p>}
                {item.status === "processing" && <p className="mt-1 text-xs text-[#6b5f8a]">Converting…</p>}
                {item.status === "error" && <p className="mt-1 text-xs text-[#ff6b8f]">{item.error}</p>}
                {item.status === "preview" && item.whiteBase64 && (
                  <PreviewApprove whiteBase64={item.whiteBase64} onApprove={() => approve(item)} onDiscard={() => discard(item)} />
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
                <div className="flex h-12 w-12 items-center justify-center rounded bg-[#1a1030]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${item.whiteBase64}`} alt={item.name} className="max-h-9 max-w-9" />
                </div>
                <p className="flex-1 text-sm font-medium text-white">{item.name}</p>
                <a
                  href={`data:image/png;base64,${item.whiteBase64}`}
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

function WarningBox({ children }: { children: React.ReactNode }) {
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
        <span className="text-white">{item.name}</span> already has a logo — this will replace their current
        version.
      </WarningBox>
      <div className="mt-2 flex items-center gap-4">
        {item.existingWhiteUrl && (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-[#1a1030]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.existingWhiteUrl} alt={item.name} className="max-h-9 max-w-9" />
          </div>
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

function PreviewApprove({
  whiteBase64,
  onApprove,
  onDiscard,
}: {
  whiteBase64: string;
  onApprove: () => Promise<void> | void;
  onDiscard: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3">
      <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-[#0f0a1f]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${whiteBase64}`} alt="preview" className="max-h-32 max-w-32 object-contain" />
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
  const [mode, setMode] = useState<null | "replace">(null);
  const [whiteBase64, setWhiteBase64] = useState<string | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function replaceWithFile(file: File) {
    setMode("replace");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("companyName", hit.matchedName ?? hit.queried);
      form.set("file", file);
      const res = await fetch("/api/logos/generate", { method: "POST", body: form });
      const data = await res.json();
      if (data.whiteBase64) {
        setWhiteBase64(data.whiteBase64);
        setOriginalBase64(data.originalBase64 ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!whiteBase64 || !originalBase64) return;
    setBusy(true);
    try {
      await fetch("/api/logos/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: hit.matchedName ?? hit.queried,
          whiteBase64,
          originalBase64,
        }),
      });
      setWhiteBase64(null);
      setOriginalBase64(null);
      setMode(null);
    } finally {
      setBusy(false);
    }
  }

  const imgSize = single ? "h-40 w-40" : "h-12 w-12";
  const imgInnerSize = single ? "max-h-32 max-w-32" : "max-h-9 max-w-9";

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <div className="flex items-center gap-4">
        {hit.whiteUrl && (
          <div className={`flex ${imgSize} items-center justify-center rounded-lg bg-[#0f0a1f]`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hit.whiteUrl} alt={hit.matchedName} className={`${imgInnerSize} object-contain`} />
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{hit.matchedName}</p>
        </div>
        <div className="flex items-center divide-x divide-[#2a1e42]">
          {hit.whiteUrl && (
            <>
              <button onClick={() => setViewing(true)} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                View
              </button>
              <a href={hit.whiteUrl} download className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
          >
            Replace logo
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) replaceWithFile(f);
        }}
      />

      {mode === "replace" && busy && !whiteBase64 && (
        <p className="mt-3 text-xs text-[#6b5f8a]">Converting…</p>
      )}

      {whiteBase64 && (
        <div className="mt-4 border-t border-[#2a1e42] pt-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
            Preview — nothing saved until you confirm
          </p>
          <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-[#0f0a1f]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${whiteBase64}`} alt="preview" className="max-h-32 max-w-32 object-contain" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={approve} disabled={busy} className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Add to database
            </button>
            <button
              onClick={() => {
                setWhiteBase64(null);
                setOriginalBase64(null);
                setMode(null);
              }}
              className="rounded-md border border-[#2a1e42] px-3 py-1.5 text-xs text-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {viewing && hit.whiteUrl && (
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
            <div className="flex max-h-[70vh] items-center justify-center rounded-lg bg-[#0f0a1f] p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hit.whiteUrl} alt={hit.matchedName} className="max-h-[60vh] w-full object-contain" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">{hit.matchedName}</p>
              <a href={hit.whiteUrl} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AutoFetchedCard({
  hit,
  onResolved,
  onDiscarded,
}: {
  hit: LookupHit;
  onResolved: (resolved: { logoId: string; matchedName: string; whiteUrl: string }) => void;
  onDiscarded: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <p className="text-sm font-medium text-white">{hit.matchedName}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">via attio</p>
      <PreviewApprove
        whiteBase64={hit.whiteBase64!}
        onApprove={async () => {
          setBusy(true);
          try {
            const res = await fetch("/api/logos/approve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyName: hit.matchedName,
                whiteBase64: hit.whiteBase64,
                originalBase64: hit.originalBase64,
                attioCompanyId: hit.attioCompanyId,
              }),
            });
            const data = await res.json();
            onResolved({
              logoId: data.logoId,
              matchedName: hit.matchedName!,
              whiteUrl: `data:image/png;base64,${hit.whiteBase64}`,
            });
          } finally {
            setBusy(false);
          }
        }}
        onDiscard={onDiscarded}
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
  onResolved: (resolved: { logoId: string; matchedName: string; whiteUrl: string }) => void;
}) {
  const [whiteBase64, setWhiteBase64] = useState<string | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("companyName", name);
      form.set("file", file);
      const res = await fetch("/api/logos/generate", { method: "POST", body: form });
      const data = await res.json();
      if (data.whiteBase64) {
        setWhiteBase64(data.whiteBase64);
        setOriginalBase64(data.originalBase64 ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!whiteBase64 || !originalBase64) return;
    setBusy(true);
    try {
      const res = await fetch("/api/logos/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name, whiteBase64, originalBase64 }),
      });
      const data = await res.json();
      onResolved({
        logoId: data.logoId,
        matchedName: name,
        whiteUrl: `data:image/png;base64,${whiteBase64}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <p className="text-sm font-medium text-white">{name}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">no logo on file</p>

      {!whiteBase64 ? (
        <label className="mt-2 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[#2a1e42] py-6 text-xs text-[#8b7ba8] hover:border-[#d4367a]">
          {busy ? "Converting…" : "Upload raw logo"}
          <input
            type="file"
            accept="image/*,.svg"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) generate(f);
            }}
          />
        </label>
      ) : (
        <PreviewApprove
          whiteBase64={whiteBase64}
          onApprove={approve}
          onDiscard={() => {
            setWhiteBase64(null);
            setOriginalBase64(null);
          }}
        />
      )}
    </div>
  );
}
