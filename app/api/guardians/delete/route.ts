import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Hard-deletes a guardian and every stored file for them (all versions,
// not just the current one, plus the raw photo). Irreversible — the UI
// confirms before calling this.
export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: list } = await supabase.storage.from("guardian-photos").list(id);
  if (list && list.length > 0) {
    await supabase.storage
      .from("guardian-photos")
      .remove(list.map((f) => `${id}/${f.name}`));
  }

  const { error } = await supabase.from("guardians").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
