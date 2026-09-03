import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { findGuardianInAttio } from "@/lib/attio";
import { findHarmonicPhotoUrl } from "@/lib/harmonic";
import { generateCyberpunkPortrait } from "@/lib/openai";

// Bucketed multi-name lookup: paste/upload a list of names and see which
// already have a result, which can be pulled from Harmonic (rare, but
// worth trying), and which need a raw photo from scratch.
export async function POST(req: NextRequest) {
  const { names } = (await req.json()) as { names: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: "names[] required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  const results = await Promise.all(
    cleaned.map(async (name) => {
      // Exact match first (precise for CSV/roster reconciliation), then
      // fall back to a substring match so a first name or partial name
      // still finds someone.
      let { data } = await supabase
        .from("guardians")
        .select("id,name,status,updated_at,guardian_versions(result_path,is_current)")
        .eq("guardian_versions.is_current", true)
        .ilike("name", name)
        .limit(1);

      if (!data || data.length === 0) {
        ({ data } = await supabase
          .from("guardians")
          .select("id,name,status,updated_at,guardian_versions(result_path,is_current)")
          .eq("guardian_versions.is_current", true)
          .ilike("name", `%${name}%`)
          .limit(1));
      }

      const match = data?.[0];
      const currentPath = match?.guardian_versions?.[0]?.result_path;

      if (match && currentPath) {
        const { data: signed } = await supabase.storage
          .from("guardian-photos")
          .createSignedUrl(currentPath, 3600 * 24);
        return {
          queried: name,
          bucket: "has_result" as const,
          guardianId: match.id,
          matchedName: match.name,
          updatedAt: match.updated_at,
          thumbUrl: signed?.signedUrl ?? null,
        };
      }

      // Not in our database — see if Attio knows them, and if Harmonic
      // has a photo for them, before giving up and asking for a raw upload.
      const attioMatch = await findGuardianInAttio(name);
      if (attioMatch) {
        // Attio's own avatar_url is sometimes a dead link (stale FullContact
        // URLs that 404), so it's a candidate to try, not a guarantee — if
        // it fails, fall through to Harmonic rather than giving up.
        const harmonicUrl = await findHarmonicPhotoUrl(attioMatch.linkedinUrl, attioMatch.email);
        const candidates = [attioMatch.avatarUrl, harmonicUrl].filter((u): u is string => Boolean(u));

        for (const photoUrl of candidates) {
          try {
            const imgRes = await fetch(photoUrl);
            if (!imgRes.ok) continue;
            const rawBytes = Buffer.from(await imgRes.arrayBuffer());
            const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
            const resultBytes = await generateCyberpunkPortrait(rawBytes, mimeType);
            return {
              queried: name,
              bucket: "harmonic_found" as const,
              matchedName: attioMatch.fullName,
              attioId: attioMatch.attioId,
              resultBase64: resultBytes.toString("base64"),
              rawBase64: rawBytes.toString("base64"),
            };
          } catch {
            // try the next candidate
          }
        }
      }

      return { queried: name, bucket: "unrecognized" as const };
    })
  );

  return NextResponse.json({ results });
}
