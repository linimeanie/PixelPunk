import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function findGuardianByName(name: string) {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("guardians")
    .select("id,name")
    .ilike("name", name)
    .limit(1);
  return data?.[0] ?? null;
}

// Commits a result image as the current version for `name`, creating the
// guardian if it doesn't exist yet. Optionally stores the raw photo too.
// Idempotent by name: reprocessing always versions, never duplicates.
export async function commitGuardianVersion({
  name,
  resultBytes,
  rawPhotoBytes,
  regenerationNote,
  attioId,
  source = "staff_upload",
}: {
  name: string;
  resultBytes: Buffer;
  rawPhotoBytes?: Buffer;
  regenerationNote?: string;
  attioId?: string;
  source?: "staff_upload" | "self_serve";
}) {
  const supabase = supabaseAdmin();

  let guardian = await findGuardianByName(name);
  if (!guardian) {
    const { data, error } = await supabase
      .from("guardians")
      .insert({ name, status: "has_result", source, attio_id: attioId })
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);
    guardian = data;
  } else {
    await supabase
      .from("guardians")
      .update({ status: "has_result", ...(attioId ? { attio_id: attioId } : {}) })
      .eq("id", guardian.id);
    await supabase
      .from("guardian_versions")
      .update({ is_current: false })
      .eq("guardian_id", guardian.id)
      .eq("is_current", true);
  }

  const versionId = randomUUID();
  const resultPath = `${guardian.id}/${versionId}.png`;
  const { error: uploadErr } = await supabase.storage
    .from("guardian-photos")
    .upload(resultPath, resultBytes, { contentType: "image/png", upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  let rawPhotoPath: string | undefined;
  if (rawPhotoBytes) {
    rawPhotoPath = `${guardian.id}/${versionId}-raw.png`;
    const { error: rawErr } = await supabase.storage
      .from("guardian-photos")
      .upload(rawPhotoPath, rawPhotoBytes, { contentType: "image/png", upsert: true });
    if (rawErr) throw new Error(rawErr.message);
    await supabase.from("guardians").update({ raw_photo_path: rawPhotoPath }).eq("id", guardian.id);
  }

  const { error: versionErr } = await supabase.from("guardian_versions").insert({
    guardian_id: guardian.id,
    result_path: resultPath,
    source_raw_photo_path: rawPhotoPath,
    regeneration_note: regenerationNote,
    is_current: true,
    created_by: "app",
  });
  if (versionErr) throw new Error(versionErr.message);

  return { guardianId: guardian.id, resultPath };
}

export async function getCurrentVersionImage(guardianId: string): Promise<Buffer> {
  const supabase = supabaseAdmin();
  const { data: version, error } = await supabase
    .from("guardian_versions")
    .select("result_path")
    .eq("guardian_id", guardianId)
    .eq("is_current", true)
    .single();
  if (error || !version) throw new Error("No current version for this guardian");

  const { data: file, error: dlErr } = await supabase.storage
    .from("guardian-photos")
    .download(version.result_path);
  if (dlErr || !file) throw new Error(dlErr?.message ?? "Could not download current image");
  return Buffer.from(await file.arrayBuffer());
}
