"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LookupHit = {
  queried: string;
  bucket: "has_result" | "unrecognized";
  guardianId?: string;
  matchedName?: string;
  thumbUrl?: string | null;
};

function parseNames(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]/).map((n) => n.trim()).filter(Boolean))];
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
}

type Suggestion = { id: string; name: string; thumbUrl: string | null };

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
        .then((data) => setSuggestions((data.results ?? []).slice(0, 8)))
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
    setLookupResults([{ queried: s.name, bucket: "has_result", guardianId: s.id, matchedName: s.name, thumbUrl: s.thumbUrl }]);
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

  const found = lookupResults?.filter((r) => r.bucket === "has_result") ?? [];
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
          ← Cyberpunk &amp; Logo Hub
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
          <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[#2a1e42] bg-[#16112c] shadow-lg">
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
                  <MissingCard key={r.queried} name={r.queried} />
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
  status: "queued" | "processing" | "preview" | "approved" | "error";
  previewBase64?: string;
  rawBase64?: string;
  error?: string;
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
      onNamesFromCsv(parseNames(text));
    }

    if (imageFiles.length > 0) {
      setQueue((q) => [
        ...q,
        ...imageFiles.map((file) => ({
          key: `${file.name}-${file.lastModified}-${Math.random()}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          file,
          status: "queued" as const,
        })),
      ]);
    }
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
    await fetch("/api/guardians/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: item.name, resultBase64: item.previewBase64, rawBase64: item.rawBase64 }),
    });
    setQueue((q) => q.map((i) => (i.key === item.key ? { ...i, status: "approved" } : i)));
  }

  function discard(item: QueueItem) {
    setQueue((q) => q.filter((i) => i.key !== item.key));
  }

  const queuedCount = queue.filter((i) => i.status === "queued" || i.status === "processing").length;

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
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">has result</p>
        </div>
        <div className="flex gap-3">
          {hit.thumbUrl && (
            <a href={hit.thumbUrl} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
              Download
            </a>
          )}
          <button onClick={() => setMode(mode === "edit" ? null : "edit")} className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
            Ask for a change
          </button>
          <button
            onClick={() => {
              setMode("replace");
              fileRef.current?.click();
            }}
            className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
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
    </div>
  );
}

function MissingCard({ name }: { name: string }) {
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
    await fetch("/api/guardians/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, resultBase64: previewBase64, rawBase64: rawBase64 ?? undefined }),
    });
    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-[#2a1e42] p-4 text-sm text-[#8b7ba8]">
        {name} — added to the database.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#2a1e42] p-4">
      <p className="text-sm font-medium text-white">{name}</p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">no picture on file</p>

      {!previewBase64 ? (
        <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[#2a1e42] py-6 text-xs text-[#8b7ba8] hover:border-[#d4367a]">
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
