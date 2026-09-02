import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { commitGuardianVersion } from "@/lib/guardians";
import { generateCyberpunkPortrait } from "@/lib/openai";

// Public endpoint (see proxy.ts) — Typeform posts here with no admin key.
// A guardian's own submission commits straight to the database with no
// confirm step (per the brief: staff can always replace a bad result
// later through the main tool), and always wins over whatever was there
// before — commitGuardianVersion already versions-by-name rather than
// duplicating, so a resubmission or an existing staff-uploaded photo both
// get correctly superseded by the guardian's fresh one.

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expected = `sha256=${hash}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("typeform-signature");
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const formResponse = payload.form_response;
  const submissionId = formResponse?.token;
  if (!submissionId) {
    return NextResponse.json({ error: "missing form_response.token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Typeform delivers webhooks at-least-once; this row is the idempotency
  // guard. A unique-constraint violation means we've already handled it.
  const { error: insertErr } = await supabase
    .from("typeform_submissions")
    .insert({ submission_id: submissionId, raw_payload: payload });
  if (insertErr) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const answers: any[] = formResponse.answers ?? [];
    const nameAnswer = answers.find((a) => a.type === "text");
    const fileAnswer = answers.find((a) => a.type === "file_url");

    const name = nameAnswer?.text?.trim();
    const fileUrl = fileAnswer?.file_url;
    if (!name || !fileUrl) {
      throw new Error("submission is missing a name or photo answer");
    }

    const apiToken = process.env.TYPEFORM_API_TOKEN;
    const fileRes = await fetch(fileUrl, {
      headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
    });
    if (!fileRes.ok) {
      throw new Error(`could not download submitted photo (${fileRes.status})`);
    }
    const rawBytes = Buffer.from(await fileRes.arrayBuffer());
    const mimeType = fileRes.headers.get("content-type") || "image/jpeg";

    const resultBytes = await generateCyberpunkPortrait(rawBytes, mimeType);

    const { guardianId } = await commitGuardianVersion({
      name,
      resultBytes,
      rawPhotoBytes: rawBytes,
      source: "self_serve",
    });

    await supabase
      .from("typeform_submissions")
      .update({ processed_at: new Date().toISOString(), guardian_id: guardianId })
      .eq("submission_id", submissionId);

    return NextResponse.json({ ok: true, guardianId });
  } catch (err) {
    // Don't leave the idempotency row stuck "unprocessed" forever without
    // a trace of what happened — record the failure so staff can spot it
    // and re-run manually via the main upload flow.
    await supabase
      .from("typeform_submissions")
      .update({ processed_at: new Date().toISOString() })
      .eq("submission_id", submissionId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "processing failed" },
      { status: 500 }
    );
  }
}
