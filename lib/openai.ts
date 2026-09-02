import { supabaseAdmin } from "@/lib/supabase";

const EDIT_URL = "https://api.openai.com/v1/images/edits";
const STYLE_REFS = [
  "style-references/ref1.png",
  "style-references/ref2.png",
  "style-references/ref3.png",
];

async function fetchStorageBytes(bucket: string, path: string): Promise<Buffer> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Could not load ${bucket}/${path}: ${error?.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function callImagesEdit(
  images: { name: string; bytes: Buffer; mimeType?: string }[],
  prompt: string
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const form = new FormData();
  form.set("model", "gpt-image-1.5");
  form.set("prompt", prompt);
  for (const img of images) {
    form.append(
      "image[]",
      new Blob([new Uint8Array(img.bytes)], { type: img.mimeType ?? "image/png" }),
      img.name
    );
  }

  const res = await fetch(EDIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI images/edits -> ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");
  return Buffer.from(b64, "base64");
}

// Full stylization: raw photo + the 3 locked style references, same prompt
// as the original n8n pipeline this replaces.
export async function generateCyberpunkPortrait(
  rawPhotoBytes: Buffer,
  rawMimeType = "image/jpeg"
): Promise<Buffer> {
  const refs = await Promise.all(
    STYLE_REFS.map(async (path, i) => ({
      name: `ref${i + 1}.png`,
      bytes: await fetchStorageBytes("system-assets", path),
    }))
  );
  return callImagesEdit(
    [...refs, { name: "target", bytes: rawPhotoBytes, mimeType: rawMimeType }],
    "consider these images (the first 3) as reference & edit the 4th image to the style of the reference images"
  );
}

// Light edit-in-place on an already-stylized result, per a free-text
// instruction (e.g. "make the skin tone brighter") — no style refs needed,
// we're adjusting the existing output, not restyling from scratch.
export async function editCyberpunkPortrait(currentImageBytes: Buffer, instruction: string): Promise<Buffer> {
  return callImagesEdit([{ name: "current.png", bytes: currentImageBytes }], instruction);
}
