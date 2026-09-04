"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatWhen } from "@/lib/format";

type Result = {
  id: string;
  companyName: string;
  status: string;
  updatedAt: string;
  whiteUrl: string | null;
  hiresUrl: string | null;
};

export default function LogoDatabase() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [totalLogos, setTotalLogos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<Result | null>(null);

  function reload() {
    setLoading(true);
    fetch(`/api/logos/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? []);
        setTotalLogos(data.totalLogos ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/logos/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults(data.results ?? []);
          setTotalLogos(data.totalLogos ?? null);
          setSelected(new Set());
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    const ids = [...selected];
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

  async function deleteOne(r: Result) {
    if (!confirm(`Delete ${r.companyName}? This removes all their versions permanently.`)) return;
    await fetch("/api/logos/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    if (viewing?.id === r.id) setViewing(null);
    reload();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link href="/logo" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
        ← Logo
      </Link>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Partner Marks
      </p>
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold text-white">Database</h1>
        {totalLogos !== null && (
          <p className="font-mono text-xs text-[#8b7ba8]">{totalLogos} total</p>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by company…"
        autoFocus
        className="mt-6 w-full rounded-lg border border-[#2a1e42] bg-[#16112c] px-4 py-2.5 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
      />

      {selected.size > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#d4367a] bg-[#1a1030] px-4 py-2.5">
          <p className="text-xs text-white">{selected.size} selected</p>
          <div className="flex gap-3">
            <button onClick={() => setSelected(new Set())} className="font-mono text-xs text-[#8b7ba8] hover:text-white">
              Clear
            </button>
            <button
              onClick={downloadSelected}
              className="rounded-md bg-[#d4367a] px-3 py-1.5 font-mono text-xs text-white hover:bg-[#e0447f]"
            >
              Download selected (.zip)
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col divide-y divide-[#2a1e42] rounded-lg border border-[#2a1e42]">
        {loading && <p className="p-4 text-sm text-[#6b5f8a]">Loading…</p>}
        {!loading && results.length === 0 && (
          <p className="p-4 text-sm text-[#6b5f8a]">No records{query ? ` for "${query}"` : ""}.</p>
        )}
        {!loading && results.map((r) => (
          <LogoRow
            key={r.id}
            result={r}
            selected={selected.has(r.id)}
            onToggle={() => toggle(r.id)}
            onView={() => setViewing(r)}
            onDelete={() => deleteOne(r)}
            onReplaced={reload}
          />
        ))}
      </div>
      {!query && (
        <p className="mt-4 font-mono text-xs text-[#6b5f8a]">
          Showing the 30 most recently added. Filter to find someone specific.
        </p>
      )}

      {viewing && (
        <div
          onClick={() => setViewing(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <div onClick={(e) => e.stopPropagation()} className="relative max-w-lg">
            <button
              onClick={() => setViewing(null)}
              aria-label="Close"
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#16112c] text-white hover:bg-[#2a1e42]"
            >
              ✕
            </button>
            <div className="flex max-h-[70vh] items-center justify-center rounded-lg bg-[#0f0a1f] p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={viewing.whiteUrl ?? ""} alt={viewing.companyName} className="max-h-[60vh] w-full object-contain" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">{viewing.companyName}</p>
              {viewing.whiteUrl && (
                <a href={viewing.whiteUrl} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LogoRow({
  result: r,
  selected,
  onToggle,
  onView,
  onDelete,
  onReplaced,
}: {
  result: Result;
  selected: boolean;
  onToggle: () => void;
  onView: () => void;
  onDelete: () => void;
  onReplaced: () => void;
}) {
  const [whiteBase64, setWhiteBase64] = useState<string | null>(null);
  const [originalBase64, setOriginalBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("companyName", r.companyName);
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
        body: JSON.stringify({ companyName: r.companyName, whiteBase64, originalBase64 }),
      });
      setWhiteBase64(null);
      setOriginalBase64(null);
      onReplaced();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-4">
        <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 accent-[#d4367a]" />
        {r.whiteUrl ? (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-[#0f0a1f]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.whiteUrl} alt={r.companyName} className="max-h-9 max-w-9 object-contain" />
          </div>
        ) : (
          <div className="h-12 w-12 rounded bg-[#2a1e42]" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{r.companyName}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
            {formatWhen(r.updatedAt)}
          </p>
        </div>
        <div className="flex items-center divide-x divide-[#2a1e42]">
          {r.whiteUrl && (
            <>
              <button onClick={onView} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                View
              </button>
              <a href={r.whiteUrl} download className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f] disabled:opacity-50"
          >
            Replace
          </button>
          <button onClick={onDelete} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
            Delete
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
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {busy && !whiteBase64 && <p className="mt-2 text-xs text-[#6b5f8a]">Converting…</p>}

      {whiteBase64 && (
        <div className="mt-3 border-t border-[#2a1e42] pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
            Preview — nothing saved until you confirm
          </p>
          <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-[#0f0a1f]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${whiteBase64}`} alt="preview" className="max-h-24 max-w-24 object-contain" />
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={approve} disabled={busy} className="rounded-md bg-[#d4367a] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              Save
            </button>
            <button
              onClick={() => {
                setWhiteBase64(null);
                setOriginalBase64(null);
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
