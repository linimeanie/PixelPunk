import { NextRequest, NextResponse } from "next/server";
import { commitLogoVersion } from "@/lib/logos";

// The one place that actually writes a logo result. Called after a human
// has looked at a /generate or /lookup preview and clicked "Add to
// database" / "Approve" — never automatically.
export async function POST(req: NextRequest) {
  const { companyName, whiteBase64, originalBase64, regenerationNote, attioCompanyId } = (await req.json()) as {
    companyName: string;
    whiteBase64: string;
    originalBase64: string;
    regenerationNote?: string;
    attioCompanyId?: string;
  };

  if (!companyName?.trim() || !whiteBase64 || !originalBase64) {
    return NextResponse.json({ error: "companyName, whiteBase64 and originalBase64 are required" }, { status: 400 });
  }

  try {
    const { logoId } = await commitLogoVersion({
      companyName: companyName.trim(),
      whiteBytes: Buffer.from(whiteBase64, "base64"),
      originalBytes: Buffer.from(originalBase64, "base64"),
      regenerationNote,
      attioCompanyId,
    });
    return NextResponse.json({ ok: true, logoId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 500 }
    );
  }
}
