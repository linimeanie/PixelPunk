import { NextRequest, NextResponse } from "next/server";
import { findHarmonicCompanyNameCandidates } from "@/lib/harmonic";
import { findWikipediaCompanyNameCandidates } from "@/lib/wikipedia";

async function attioNames(q: string): Promise<string[]> {
  const key = process.env.ATTIO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.attio.com/v2/objects/companies/records/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { name: { "$contains": q } }, limit: 10 }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const names = (json.data ?? []).map((r: any) => r.values.name?.[0]?.value).filter(Boolean);
    return [...new Set(names)] as string[];
  } catch {
    return [];
  }
}

// Live company-name autocomplete/"did you mean" suggestions, tried in
// order — Attio (our own CRM, most trustworthy for names we'd actually
// use) first, then Harmonic, then Wikipedia — stopping at the first
// source that has anything, so a company covered by an earlier, more
// reliable source doesn't also get diluted by a noisier one.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const attio = await attioNames(q);
  if (attio.length > 0) {
    return NextResponse.json({ results: attio.map((companyName) => ({ companyName, source: "attio" as const })) });
  }

  const harmonic = await findHarmonicCompanyNameCandidates(q);
  if (harmonic.length > 0) {
    return NextResponse.json({ results: harmonic.map((companyName) => ({ companyName, source: "harmonic" as const })) });
  }

  const wikipedia = await findWikipediaCompanyNameCandidates(q);
  return NextResponse.json({ results: wikipedia.map((companyName) => ({ companyName, source: "wikipedia" as const })) });
}
