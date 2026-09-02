import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = supabaseAdmin();

  let query = supabase
    .from("guardians")
    .select(
      "id,name,status,updated_at,guardian_versions(result_path,is_current)"
    )
    .eq("guardian_versions.is_current", true)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (data ?? []).map(async (row) => {
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
        thumbUrl,
      };
    })
  );

  return NextResponse.json({ results });
}
