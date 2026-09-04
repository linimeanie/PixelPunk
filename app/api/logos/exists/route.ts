import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Exact-match existence check, used by the bulk dropzone to catch a
// filename that happens to match a company already in the database —
// that upload would silently version (overwrite) their current logo
// instead of creating a new one, and the dropzone has no side-by-side
// view to notice that by eye.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ exists: false });

  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("logos")
    .select("id,company_name,logo_versions(white_transparent_path,is_current)")
    .eq("logo_versions.is_current", true)
    .ilike("company_name", name)
    .limit(1);

  const match = data?.[0];
  const currentPath = match?.logo_versions?.[0]?.white_transparent_path;
  if (!match || !currentPath) return NextResponse.json({ exists: false });

  const { data: signed } = await supabase.storage.from("logos").createSignedUrl(currentPath, 3600 * 24);
  return NextResponse.json({ exists: true, logoId: match.id, matchedName: match.company_name, whiteUrl: signed?.signedUrl ?? null });
}
