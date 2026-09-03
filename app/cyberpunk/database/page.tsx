"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatWhen } from "@/lib/format";

type Result = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  thumbUrl: string | null;
  guardianBadge: "26" | "27" | null;
};

type BadgeFilter = "all" | "26" | "27";

const BADGE_FILTERS: { value: BadgeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "27", label: "🛡️ '27" },
  { value: "26", label: "🛡️ '26" },
];

function searchUrl(query: string, badgeFilter: BadgeFilter) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (badgeFilter !== "all") params.set("badge", badgeFilter);
  return `/api/guardians/search?${params.toString()}`;
}

export default function CyberpunkDatabase() {
  const [query, setQuery] = useState("");
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>("all");
  const [results, setResults] = useState<Result[]>([]);
  const [totalGuardians, setTotalGuardians] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<Result | null>(null);

  function reload() {
    setLoading(true);
    fetch(searchUrl(query, badgeFilter))
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? []);
        setTotalGuardians(data.totalGuardians ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(searchUrl(query, badgeFilter), { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          setResults(data.results ?? []);
          setTotalGuardians(data.totalGuardians ?? null);
          setSelected(new Set());
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, badgeFilter]);

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
      <div className="mt-2 flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold text-white">Database</h1>
        {totalGuardians !== null && (
          <p className="font-mono text-xs text-[#8b7ba8]">{totalGuardians} total</p>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by name…"
        autoFocus
        className="mt-6 w-full rounded-lg border border-[#2a1e42] bg-[#16112c] px-4 py-2.5 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
      />

      <div className="mt-3 flex gap-2">
        {BADGE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setBadgeFilter(f.value)}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs transition ${
              badgeFilter === f.value
                ? "border-[#d4367a] bg-[#1a1030] text-white"
                : "border-[#2a1e42] text-[#8b7ba8] hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

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
          <p className="p-4 text-sm text-[#6b5f8a]">
            No records{query ? ` for "${query}"` : ""}
            {badgeFilter !== "all" ? ` matching ${BADGE_FILTERS.find((f) => f.value === badgeFilter)?.label}` : ""}.
          </p>
        )}
        {!loading && results.map((r) => (
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
              <p className="text-sm font-medium text-white">
                {r.name}
                {r.guardianBadge && <span className="ml-2">🛡️ '{r.guardianBadge}</span>}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
                {formatWhen(r.updatedAt)}
              </p>
            </div>
            <div className="flex items-center divide-x divide-[#2a1e42]">
              {r.thumbUrl && (
                <>
                  <button onClick={() => setViewing(r)} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                    View
                  </button>
                  <a href={r.thumbUrl} download className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                    Download
                  </a>
                </>
              )}
              <button onClick={() => deleteOne(r)} className="px-3 font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {!query && badgeFilter === "all" && (
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.thumbUrl ?? ""}
              alt={viewing.name}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm font-medium text-white">{viewing.name}</p>
              <a href={viewing.thumbUrl ?? ""} download className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
