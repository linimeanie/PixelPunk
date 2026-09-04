import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Hard-deletes a logo and every stored file for it (all versions, both
// white and hi-res). Irreversible — the UI confirms before calling this.
export async function POST(req: NextRequest) {
  const { id } = (await req.json()) as { id: string };
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: list } = await supabase.storage.from("logos").list(id);
  if (list && list.length > 0) {
    await supabase.storage
      .from("logos")
      .remove(list.map((f) => `${id}/${f.name}`));
  }

  const { error } = await supabase.from("logos").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
