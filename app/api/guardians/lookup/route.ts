import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Bucketed multi-name lookup: paste/upload a list of names and see which
// already have a result vs. which aren't recognised at all. (Attio
// cross-referencing for a distinct "recognised, no photo yet" bucket isn't
// wired up yet — everything not found locally currently falls into
// "unrecognized".)
export async function POST(req: NextRequest) {
  const { names } = (await req.json()) as { names: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: "names[] required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  const results = await Promise.all(
    cleaned.map(async (name) => {
      const { data } = await supabase
        .from("guardians")
        .select("id,name,status,guardian_versions(result_path,is_current)")
        .eq("guardian_versions.is_current", true)
        .ilike("name", name)
        .limit(1);

      const match = data?.[0];
      const currentPath = match?.guardian_versions?.[0]?.result_path;

      if (match && currentPath) {
        const { data: signed } = await supabase.storage
          .from("guardian-photos")
          .createSignedUrl(currentPath, 300);
        return {
          queried: name,
          bucket: "has_result" as const,
          guardianId: match.id,
          matchedName: match.name,
          thumbUrl: signed?.signedUrl ?? null,
        };
      }

      return { queried: name, bucket: "unrecognized" as const };
    })
  );

  return NextResponse.json({ results });
}
