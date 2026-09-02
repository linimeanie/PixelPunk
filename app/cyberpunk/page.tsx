"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Result = {
  id: string;
  name: string;
  status: string;
  thumbUrl: string | null;
};

export default function CyberpunkModule() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/guardians/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data) => setResults(data.results ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link href="/" className="font-mono text-xs text-[#8b7ba8] hover:text-white">
        ← Cyberpunk &amp; Logo Hub
      </Link>
      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[#8b7ba8]">
        Guardian Portraits
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-white">Cyberpunk</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a guardian by name…"
        autoFocus
        className="mt-6 w-full rounded-lg border border-[#2a1e42] bg-[#16112c] px-4 py-3 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
      />

      <div className="mt-6 flex flex-col divide-y divide-[#2a1e42] rounded-lg border border-[#2a1e42]">
        {loading && (
          <p className="p-4 text-sm text-[#6b5f8a]">Loading…</p>
        )}
        {!loading && results.length === 0 && (
          <p className="p-4 text-sm text-[#6b5f8a]">
            No records{query ? ` for "${query}"` : ""}.
          </p>
        )}
        {results.map((r) => (
          <div key={r.id} className="flex items-center gap-4 p-4">
            {r.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.thumbUrl}
                alt={r.name}
                className="h-12 w-12 rounded-full object-cover"
              />
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
              <a
                href={r.thumbUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-[#8b7ba8] hover:text-[#ff6b8f]"
              >
                View
              </a>
            )}
          </div>
        ))}
      </div>

      {!query && (
        <p className="mt-4 font-mono text-xs text-[#6b5f8a]">
          Showing the 30 most recently added. Search to find someone specific.
        </p>
      )}
    </div>
  );
}
