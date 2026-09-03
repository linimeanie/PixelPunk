import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Ranks a name against the query so an exact/prefix match always beats an
// incidental substring hit buried in a surname, regardless of which one
// was updated more recently.
function matchRank(name: string, q: string): number {
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 0;
  if (n.startsWith(query)) return 1;
  if (n.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  return 3; // substring match elsewhere in the name
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const badge = req.nextUrl.searchParams.get("badge");
  const supabase = supabaseAdmin();

  let query = supabase
    .from("guardians")
    .select(
      "id,name,status,updated_at,guardian_badge,guardian_versions(result_path,is_current)"
    )
    .eq("guardian_versions.is_current", true)
    .order("updated_at", { ascending: false })
    .limit(q || badge ? 200 : 30);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  if (badge === "26" || badge === "27") {
    query = query.eq("guardian_badge", badge);
  } else if (badge === "none") {
    query = query.is("guardian_badge", null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ranked = q
    ? (data ?? [])
        .slice()
        .sort((a, b) => matchRank(a.name, q) - matchRank(b.name, q))
        .slice(0, 30)
    : data ?? [];

  const results = await Promise.all(
    ranked.map(async (row) => {
      const currentPath = row.guardian_versions?.[0]?.result_path ?? null;
      let thumbUrl: string | null = null;
      if (currentPath) {
        const { data: signed } = await supabase.storage
          .from("guardian-photos")
          .createSignedUrl(currentPath, 300);
        thumbUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updated_at,
        guardianBadge: row.guardian_badge,
        thumbUrl,
      };
    })
  );

  return NextResponse.json({ results });
}
