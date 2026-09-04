import { NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { ids } = (await req.json()) as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return new Response("ids[] required", { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: logos } = await supabase
    .from("logos")
    .select("id,company_name,logo_versions(white_transparent_path,original_hires_path,is_current)")
    .eq("logo_versions.is_current", true)
    .in("id", ids);

  const passthrough = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(passthrough);

  (async () => {
    for (const l of logos ?? []) {
      const version = l.logo_versions?.[0];
      if (!version) continue;
      if (version.white_transparent_path) {
        const { data: white } = await supabase.storage.from("logos").download(version.white_transparent_path);
        if (white) archive.append(Buffer.from(await white.arrayBuffer()), { name: `${l.company_name}/white.png` });
      }
      if (version.original_hires_path) {
        const { data: hires } = await supabase.storage.from("logos").download(version.original_hires_path);
        if (hires) archive.append(Buffer.from(await hires.arrayBuffer()), { name: `${l.company_name}/original.png` });
      }
    }
    await archive.finalize();
  })();

  return new Response(passthrough as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="logos.zip"',
    },
  });
}
