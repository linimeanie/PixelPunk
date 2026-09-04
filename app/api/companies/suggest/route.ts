import { NextRequest, NextResponse } from "next/server";

// Live company-name autocomplete sourced from Attio, for typing a name
// that isn't in our own database yet — separate from /api/logos/search,
// which only knows about logos we already have.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const key = process.env.ATTIO_API_KEY;
  if (!q || !key) return NextResponse.json({ results: [] });

  try {
    const res = await fetch("https://api.attio.com/v2/objects/companies/records/query", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filter: { name: { "$contains": q } }, limit: 10 }),
    });
    if (!res.ok) return NextResponse.json({ results: [] });

    const json = await res.json();
    const names = [...new Set((json.data ?? []).map((r: any) => r.values.name?.[0]?.value).filter(Boolean))];
    return NextResponse.json({ results: names.map((companyName) => ({ companyName })) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
