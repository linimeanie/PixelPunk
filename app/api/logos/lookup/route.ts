import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { findCompanyInAttio } from "@/lib/attio";
import { findHarmonicCompanyLogoUrl } from "@/lib/harmonic";
import { findWikipediaLogoUrl } from "@/lib/wikipedia";
import { convertToWhiteTransparent, RASTER_DENSITY } from "@/lib/logos";

type Candidate = { source: "attio" | "clearbit" | "harmonic" | "wikipedia"; url: string };

async function convertCandidate(candidate: Candidate) {
  const imgRes = await fetch(candidate.url);
  if (!imgRes.ok) return null;
  const rawBytes = Buffer.from(await imgRes.arrayBuffer());
  const originalBytes = await sharp(rawBytes, { density: RASTER_DENSITY }).png().toBuffer();
  const { buffer: whiteBytes, quality } = await convertToWhiteTransparent(rawBytes);
  return {
    source: candidate.source,
    whiteBase64: whiteBytes.toString("base64"),
    originalBase64: originalBytes.toString("base64"),
    quality,
  };
}

// Bucketed multi-name lookup: paste/upload a list of company names and
// see which already have a result, which can be auto-fetched (tries
// Attio's own logo_url, a Clearbit domain fallback, Harmonic, and
// Wikidata's logo property in parallel and returns every one that
// actually resolves — auto-fetch quality varies a lot by source, so
// staff picks the best one rather than the app silently guessing), and
// which need a raw logo uploaded from scratch.
export async function POST(req: NextRequest) {
  const { names } = (await req.json()) as { names: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ error: "names[] required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  const results = await Promise.all(
    cleaned.map(async (name) => {
      let { data } = await supabase
        .from("logos")
        .select("id,company_name,updated_at,logo_versions(white_transparent_path,original_hires_path,is_current)")
        .eq("logo_versions.is_current", true)
        .ilike("company_name", name)
        .limit(1);

      if (!data || data.length === 0) {
        ({ data } = await supabase
          .from("logos")
          .select("id,company_name,updated_at,logo_versions(white_transparent_path,original_hires_path,is_current)")
          .eq("logo_versions.is_current", true)
          .ilike("company_name", `%${name}%`)
          .limit(1));
      }

      const match = data?.[0];
      const currentWhite = match?.logo_versions?.[0]?.white_transparent_path;

      if (match && currentWhite) {
        const { data: signed } = await supabase.storage
          .from("logos")
          .createSignedUrl(currentWhite, 3600 * 24);
        return {
          queried: name,
          bucket: "has_result" as const,
          logoId: match.id,
          matchedName: match.company_name,
          updatedAt: match.updated_at,
          whiteUrl: signed?.signedUrl ?? null,
        };
      }

      // Not in our database — gather every source that has a logo for
      // this company (Attio, Clearbit, Harmonic, Wikidata) rather than
      // stopping at the first one that resolves.
      const company = await findCompanyInAttio(name);
      const [harmonicLogoUrl, wikipediaLogoUrl] = await Promise.all([
        findHarmonicCompanyLogoUrl(company?.domain ?? null),
        findWikipediaLogoUrl(name),
      ]);

      const candidateUrls: Candidate[] = [
        company?.logoUrl ? { source: "attio", url: company.logoUrl } : null,
        company?.domain ? { source: "clearbit", url: `https://logo.clearbit.com/${company.domain}` } : null,
        harmonicLogoUrl ? { source: "harmonic", url: harmonicLogoUrl } : null,
        wikipediaLogoUrl ? { source: "wikipedia", url: wikipediaLogoUrl } : null,
      ].filter((c): c is Candidate => c !== null);

      const converted = (await Promise.all(candidateUrls.map((c) => convertCandidate(c).catch(() => null)))).filter(
        (c): c is NonNullable<typeof c> => c !== null
      );

      if (converted.length > 0) {
        const bestQuality = Math.max(...converted.map((c) => c.quality));
        const candidates = converted
          .map((c) => ({ ...c, recommended: c.quality === bestQuality }))
          .sort((a, b) => b.quality - a.quality);
        return {
          queried: name,
          bucket: "auto_fetched" as const,
          matchedName: company?.companyName ?? name,
          attioCompanyId: company?.companyId,
          candidates,
        };
      }

      return { queried: name, bucket: "unrecognized" as const };
    })
  );

  return NextResponse.json({ results });
}
