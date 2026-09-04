import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";

// Rasterizes vector input (SVG) at a much higher resolution than its
// declared intrinsic size — Commons/Wikipedia SVGs in particular often
// declare a tiny viewBox, which would otherwise produce a postage-stamp
// logo. Harmless for raster formats; sharp only uses density for vectors.
export const RASTER_DENSITY = 1200;

// Converts any logo — already-transparent, or a flat solid background —
// into a pure-white silhouette on a transparent background, trimmed to
// its content. Deterministic (no AI), so the shape is always exactly the
// source's, never redrawn.
export async function convertToWhiteTransparent(inputBytes: Buffer): Promise<Buffer> {
  const img = sharp(inputBytes, { density: RASTER_DENSITY }).ensureAlpha();
  const { width, height } = await img.metadata();
  if (!width || !height) throw new Error("Could not read image dimensions");

  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const n = width * height;

  let transparentCount = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 10) transparentCount++;
  }
  const hasRealAlpha = transparentCount / n > 0.005;

  const out = Buffer.alloc(data.length);
  data.copy(out);

  if (!hasRealAlpha) {
    // Flat background: sample the four corners, then build an alpha mask
    // from color distance to that background (with a small feather range
    // so edges stay smooth instead of jagged).
    const pxAt = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const corners = [pxAt(0, 0), pxAt(width - 1, 0), pxAt(0, height - 1), pxAt(width - 1, height - 1)];
    const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((s, p) => s + p[c], 0) / 4));

    const low = 18;
    const high = 55;
    for (let i = 0; i < n; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const dist = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
      let a: number;
      if (dist <= low) a = 0;
      else if (dist >= high) a = 255;
      else a = Math.round(((dist - low) / (high - low)) * 255);
      out[i * 4 + 3] = a;
    }
  }

  // Recolor: pure white wherever visible at all, regardless of source color.
  for (let i = 0; i < n; i++) {
    if (out[i * 4 + 3] > 0) {
      out[i * 4] = 255;
      out[i * 4 + 1] = 255;
      out[i * 4 + 2] = 255;
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } })
    .trim()
    .png()
    .toBuffer();
}

export async function findLogoByName(companyName: string) {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("logos")
    .select("id,company_name")
    .ilike("company_name", companyName)
    .limit(1);
  return data?.[0] ?? null;
}

// Commits a white-transparent + hi-res-original pair as the current
// version for `companyName`, creating the logo if it doesn't exist yet.
// Idempotent by name: reprocessing always versions, never duplicates.
export async function commitLogoVersion({
  companyName,
  whiteBytes,
  originalBytes,
  regenerationNote,
  attioCompanyId,
}: {
  companyName: string;
  whiteBytes: Buffer;
  originalBytes: Buffer;
  regenerationNote?: string;
  attioCompanyId?: string;
}) {
  const supabase = supabaseAdmin();

  let logo = await findLogoByName(companyName);
  if (!logo) {
    const { data, error } = await supabase
      .from("logos")
      .insert({ company_name: companyName, status: "has_result", attio_company_id: attioCompanyId })
      .select("id,company_name")
      .single();
    if (error) throw new Error(error.message);
    logo = data;
  } else {
    await supabase
      .from("logos")
      .update({ status: "has_result", ...(attioCompanyId ? { attio_company_id: attioCompanyId } : {}) })
      .eq("id", logo.id);
    await supabase
      .from("logo_versions")
      .update({ is_current: false })
      .eq("logo_id", logo.id)
      .eq("is_current", true);
  }

  const versionId = randomUUID();
  const whitePath = `${logo.id}/${versionId}-white.png`;
  const hiresPath = `${logo.id}/${versionId}-original.png`;

  const { error: whiteErr } = await supabase.storage
    .from("logos")
    .upload(whitePath, whiteBytes, { contentType: "image/png", upsert: true });
  if (whiteErr) throw new Error(whiteErr.message);

  const { error: hiresErr } = await supabase.storage
    .from("logos")
    .upload(hiresPath, originalBytes, { contentType: "image/png", upsert: true });
  if (hiresErr) throw new Error(hiresErr.message);

  const { error: versionErr } = await supabase.from("logo_versions").insert({
    logo_id: logo.id,
    white_transparent_path: whitePath,
    original_hires_path: hiresPath,
    regeneration_note: regenerationNote,
    is_current: true,
    created_by: "app",
  });
  if (versionErr) throw new Error(versionErr.message);

  return { logoId: logo.id, whitePath, hiresPath };
}
