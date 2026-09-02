"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type BrowseResult = { id: string; name: string; status: string; thumbUrl: string | null };
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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
}

export default function CyberpunkModule() {
  const [browseQuery, setBrowseQuery] = useState("");
  const [browseResults, setBrowseResults] = useState<BrowseResult[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);

  const [lookupInput, setLookupInput] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupHit[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (lookupResults !== null) return; // only browse when not mid-lookup
    const controller = new AbortController();
    setBrowseLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/guardians/search?q=${encodeURIComponent(browseQuery)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => setBrowseResults(data.results ?? []))
        .catch(() => {})
        .finally(() => setBrowseLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [browseQuery, lookupResults]);

  async function runLookup() {
    const names = parseNames(lookupInput);
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
      <Link href="/" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
        ← Cyberpunk &amp; Logo Hub
      </Link>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Guardian Portraits
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Cyberpunk</h1>

      <div className="mt-6 rounded-lg border border-[#2a1e42] bg-[#16112c] p-3">
        <textarea
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              runLookup();
            }
          }}
          placeholder="Type or paste one or more names, separated by commas or new lines…"
          rows={2}
          className="w-full resize-none bg-transparent text-sm text-white placeholder:text-[#6b5f8a] focus:outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          {lookupResults !== null && (
            <button
              onClick={clearLookup}
              className="rounded-md px-3 py-1.5 font-mono text-xs text-[#8b7ba8] hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            onClick={runLookup}
            disabled={lookingUp || !lookupInput.trim()}
            className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e0447f] disabled:opacity-50"
          >
            {lookingUp ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {lookupResults === null ? (
        <>
          <input
            type="text"
            value={browseQuery}
            onChange={(e) => setBrowseQuery(e.target.value)}
            placeholder="…or just browse: filter by name"
            className="mt-3 w-full rounded-lg border border-[#2a1e42] bg-[#16112c] px-4 py-2.5 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
          />
          <div className="mt-4 flex flex-col divide-y divide-[#2a1e42] rounded-lg border border-[#2a1e42]">
            {browseLoading && <p className="p-4 text-sm text-[#6b5f8a]">Loading…</p>}
            {!browseLoading && browseResults.length === 0 && (
              <p className="p-4 text-sm text-[#6b5f8a]">No records{browseQuery ? ` for "${browseQuery}"` : ""}.</p>
            )}
            {browseResults.map((r) => (
              <div key={r.id} className="flex items-center gap-4 p-4">
                {r.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbUrl} alt={r.name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-[#2a1e42]" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{r.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                    {r.status.replace("_", " ")}
                  </p>
                </div>
                {r.thumbUrl && (
                  <a href={r.thumbUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
          {!browseQuery && (
            <p className="mt-4 font-mono text-xs text-[#6b5f8a]">
              Showing the 30 most recently added. Search above to look up specific names.
            </p>
          )}
        </>
      ) : (
        <div className="mt-6 space-y-8">
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
          <button
            onClick={() => setMode(mode === "edit" ? null : "edit")}
            className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
          >
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
          <img
            src={`data:image/png;base64,${previewBase64}`}
            alt="preview"
            className="h-40 w-40 rounded-lg object-cover"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={approve}
              disabled={busy}
              className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
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
  const [instruction, setInstruction] = useState("");
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

  async function refine() {
    if (!instruction.trim() || !previewBase64) return;
    setBusy(true);
    try {
      const res = await fetch("/api/guardians/edit-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: previewBase64, instruction }),
      });
      const data = await res.json();
      if (data.resultBase64) setPreviewBase64(data.resultBase64);
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
          name,
          resultBase64: previewBase64,
          rawBase64: rawBase64 ?? undefined,
          regenerationNote: instruction || undefined,
        }),
      });
      setDone(true);
    } finally {
      setBusy(false);
    }
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
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${previewBase64}`}
            alt="preview"
            className="h-40 w-40 rounded-lg object-cover"
          />
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ask for a change (optional)"
              className="flex-1 rounded-md border border-[#2a1e42] bg-[#0f0a1f] px-3 py-2 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
            />
            <button
              onClick={refine}
              disabled={busy || !instruction.trim()}
              className="rounded-md border border-[#2a1e42] px-3 py-2 text-xs text-white disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={approve}
              disabled={busy}
              className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
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
