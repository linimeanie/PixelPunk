"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function UnlockForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const res = await fetch("/api/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/");
      router.refresh();
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-[#8b7ba8]">
        Deep Tech Momentum
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-white">PixelPunk</h1>
      <p className="mt-2 max-w-sm text-sm text-[#a89bc4]">
        Internal tool. Enter the shared admin key to continue.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Admin key"
          autoFocus
          className="rounded-lg border border-[#2a1e42] bg-[#16112c] px-4 py-3 text-sm text-white placeholder:text-[#6b5f8a] focus:border-[#d4367a] focus:outline-none"
        />
        {error && (
          <p className="text-xs text-[#ff6b8f]">
            Key not recognised. Ask in #dtm-ops for the current key.
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !key}
          className="rounded-lg bg-[#d4367a] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#e0447f] disabled:opacity-50"
        >
          {loading ? "Checking…" : "Unlock"}
        </button>
      </form>

      <p className="mt-6 max-w-xs text-xs text-[#6b5f8a]">
        One shared key for the whole internal team — no individual accounts.
      </p>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockForm />
    </Suspense>
  );
}
