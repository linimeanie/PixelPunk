import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Ranks a name against the query so an exact/prefix match always beats an
// incidental substring hit buried in a longer name, regardless of which
// one was updated more recently.
function matchRank(name: string, q: string): number {
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 0;
  if (n.startsWith(query)) return 1;
  if (n.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return 3;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = supabaseAdmin();

  let query = supabase
    .from("logos")
    .select(
      "id,company_name,status,updated_at,logo_versions(white_transparent_path,original_hires_path,is_current)"
    )
    .eq("logo_versions.is_current", true)
    .order("updated_at", { ascending: false })
    .limit(q ? 200 : 30);

  if (q) {
    query = query.ilike("company_name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count: totalLogos } = await supabase
    .from("logos")
    .select("*", { count: "exact", head: true });

  const ranked = q
    ? (data ?? [])
        .slice()
        .sort((a, b) => matchRank(a.company_name, q) - matchRank(b.company_name, q))
        .slice(0, 30)
    : data ?? [];

  const results = await Promise.all(
    ranked.map(async (row) => {
      const version = row.logo_versions?.[0];
      let whiteUrl: string | null = null;
      let hiresUrl: string | null = null;
      if (version?.white_transparent_path) {
        const { data: signed } = await supabase.storage
          .from("logos")
          .createSignedUrl(version.white_transparent_path, 3600 * 24);
        whiteUrl = signed?.signedUrl ?? null;
      }
      if (version?.original_hires_path) {
        const { data: signed } = await supabase.storage
          .from("logos")
          .createSignedUrl(version.original_hires_path, 3600 * 24);
        hiresUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        companyName: row.company_name,
        status: row.status,
        updatedAt: row.updated_at,
        whiteUrl,
        hiresUrl,
      };
    })
  );

  return NextResponse.json({ results, totalLogos: totalLogos ?? 0 });
}
