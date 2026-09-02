import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Exact-match existence check, used by the bulk dropzone to catch a
// filename that happens to match someone already in the database — that
// upload would silently version (overwrite) their current photo instead
// of creating someone new, and the dropzone has no side-by-side view to
// notice that by eye.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ exists: false });

  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("guardians")
    .select("id,name,guardian_versions(result_path,is_current)")
    .eq("guardian_versions.is_current", true)
    .ilike("name", name)
    .limit(1);

  const match = data?.[0];
  const currentPath = match?.guardian_versions?.[0]?.result_path;
  if (!match || !currentPath) return NextResponse.json({ exists: false });

  const { data: signed } = await supabase.storage.from("guardian-photos").createSignedUrl(currentPath, 300);
  return NextResponse.json({ exists: true, guardianId: match.id, matchedName: match.name, thumbUrl: signed?.signedUrl ?? null });
}
