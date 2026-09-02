"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Result = { id: string; name: string; status: string; updatedAt: string; thumbUrl: string | null };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CyberpunkDatabase() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<Result | null>(null);

  function reload() {
    setLoading(true);
    fetch(`/api/guardians/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data) => setResults(data.results ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/guardians/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults(data.results ?? []);
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

  async function deleteOne(r: Result) {
    if (!confirm(`Delete ${r.name}? This removes all their versions permanently.`)) return;
    await fetch("/api/guardians/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    if (viewing?.id === r.id) setViewing(null);
    reload();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link href="/cyberpunk" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
        ← Cyberpunk
      </Link>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Guardian Portraits
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Database</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name…"
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
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4 accent-[#d4367a]"
            />
            {r.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.thumbUrl} alt={r.name} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-[#2a1e42]" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{r.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                {formatDate(r.updatedAt)}
              </p>
            </div>
            <div className="flex gap-3">
              {r.thumbUrl && (
                <>
                  <button onClick={() => setViewing(r)} className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                    View
                  </button>
                  <a href={r.thumbUrl} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                    Download
                  </a>
                </>
              )}
              <button onClick={() => deleteOne(r)} className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Delete
              </button>
            </div>
          </div>
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
          <div onClick={(e) => e.stopPropagation()} className="max-w-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.thumbUrl ?? ""}
              alt={viewing.name}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">{viewing.name}</p>
              <div className="flex gap-3">
                <a href={viewing.thumbUrl ?? ""} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                  Download
                </a>
                <button onClick={() => setViewing(null)} className="font-mono text-xs text-[#8b7ba8] hover:text-white">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
