import { NextRequest, NextResponse } from "next/server";
import { generateCyberpunkPortrait } from "@/lib/openai";

// Runs the full cyberpunk stylization on a freshly-uploaded raw photo.
// Returns a PREVIEW only (base64) — nothing is written to the database or
// storage until /api/guardians/approve is called. Used both for brand new
// guardians and for "replace version" (reprocessing an existing name with
// a new raw photo).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = form.get("name");
  const file = form.get("file");

  if (typeof name !== "string" || !name.trim() || !(file instanceof Blob)) {
    return NextResponse.json({ error: "name and file are required" }, { status: 400 });
  }

  try {
    const rawBytes = Buffer.from(await file.arrayBuffer());
    const resultBytes = await generateCyberpunkPortrait(rawBytes, file.type || "image/jpeg");
    return NextResponse.json({
      name: name.trim(),
      resultBase64: resultBytes.toString("base64"),
      rawBase64: rawBytes.toString("base64"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
