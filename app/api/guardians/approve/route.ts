import { NextRequest, NextResponse } from "next/server";
import { commitGuardianVersion } from "@/lib/guardians";

// The one place that actually writes a guardian result. Called after a
// human has looked at a /generate or /[id]/edit preview and clicked
// "Add to database" / "Approve" — never automatically.
export async function POST(req: NextRequest) {
  const { name, resultBase64, rawBase64, regenerationNote } = (await req.json()) as {
    name: string;
    resultBase64: string;
    rawBase64?: string;
    regenerationNote?: string;
  };

  if (!name?.trim() || !resultBase64) {
    return NextResponse.json({ error: "name and resultBase64 are required" }, { status: 400 });
  }

  try {
    const { guardianId } = await commitGuardianVersion({
      name: name.trim(),
      resultBytes: Buffer.from(resultBase64, "base64"),
      rawPhotoBytes: rawBase64 ? Buffer.from(rawBase64, "base64") : undefined,
      regenerationNote,
    });
    return NextResponse.json({ ok: true, guardianId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 500 }
    );
  }
}
