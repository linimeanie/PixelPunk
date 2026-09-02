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
  const { data: guardians } = await supabase
    .from("guardians")
    .select("id,name,guardian_versions(result_path,is_current)")
    .eq("guardian_versions.is_current", true)
    .in("id", ids);

  const passthrough = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(passthrough);

  (async () => {
    for (const g of guardians ?? []) {
      const path = g.guardian_versions?.[0]?.result_path;
      if (!path) continue;
      const { data: file } = await supabase.storage.from("guardian-photos").download(path);
      if (!file) continue;
      const bytes = Buffer.from(await file.arrayBuffer());
      archive.append(bytes, { name: `${g.name}.png` });
    }
    await archive.finalize();
  })();

  return new Response(passthrough as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="guardians.zip"',
    },
  });
}
