import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { findCompanyInAttio } from "@/lib/attio";
import { convertToWhiteTransparent } from "@/lib/logos";

// Bucketed multi-name lookup: paste/upload a list of company names and
// see which already have a result, which can be auto-fetched (Attio's
// own logo_url, or a Clearbit domain fallback), and which need a raw
// logo uploaded from scratch.
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

      // Not in our database — see if Attio knows this company and has a
      // logo for it (its own logo_url, or a Clearbit domain fallback).
      const company = await findCompanyInAttio(name);
      if (company) {
        const candidates = [
          company.logoUrl,
          company.domain ? `https://logo.clearbit.com/${company.domain}` : null,
        ].filter((u): u is string => Boolean(u));

        for (const url of candidates) {
          try {
            const imgRes = await fetch(url);
            if (!imgRes.ok) continue;
            const rawBytes = Buffer.from(await imgRes.arrayBuffer());
            const originalBytes = await sharp(rawBytes).png().toBuffer();
            const whiteBytes = await convertToWhiteTransparent(rawBytes);
            return {
              queried: name,
              bucket: "auto_fetched" as const,
              matchedName: company.companyName,
              attioCompanyId: company.companyId,
              whiteBase64: whiteBytes.toString("base64"),
              originalBase64: originalBytes.toString("base64"),
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
