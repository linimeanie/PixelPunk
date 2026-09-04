import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { convertToWhiteTransparent } from "@/lib/logos";

// Runs the white/transparent conversion on a freshly-uploaded raw logo.
// Returns a PREVIEW only (base64) — nothing is written to the database or
// storage until /api/logos/approve is called.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const companyName = form.get("companyName");
  const file = form.get("file");

  if (typeof companyName !== "string" || !companyName.trim() || !(file instanceof Blob)) {
    return NextResponse.json({ error: "companyName and file are required" }, { status: 400 });
  }

  try {
    const rawBytes = Buffer.from(await file.arrayBuffer());
    // Normalize the original to PNG too, so both stored files are a
    // predictable, always-valid format regardless of what was uploaded.
    const originalBytes = await sharp(rawBytes).png().toBuffer();
    const whiteBytes = await convertToWhiteTransparent(rawBytes);
    return NextResponse.json({
      companyName: companyName.trim(),
      whiteBase64: whiteBytes.toString("base64"),
      originalBase64: originalBytes.toString("base64"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Conversion failed" },
      { status: 500 }
    );
  }
}
