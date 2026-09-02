import { NextRequest, NextResponse } from "next/server";
import { editCyberpunkPortrait } from "@/lib/openai";

// Generic "ask for a change" on any image bytes — used both to refine a
// not-yet-approved generation and to tweak an existing guardian's current
// result (the client fetches the current image bytes itself and posts
// them here). Returns a PREVIEW only; nothing is committed.
export async function POST(req: NextRequest) {
  const { imageBase64, instruction } = (await req.json()) as {
    imageBase64: string;
    instruction: string;
  };
  if (!imageBase64 || !instruction?.trim()) {
    return NextResponse.json({ error: "imageBase64 and instruction are required" }, { status: 400 });
  }

  try {
    const resultBytes = await editCyberpunkPortrait(Buffer.from(imageBase64, "base64"), instruction.trim());
    return NextResponse.json({ resultBase64: resultBytes.toString("base64") });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Edit failed" },
      { status: 500 }
    );
  }
}
