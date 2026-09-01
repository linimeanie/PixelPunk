import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { key } = await req.json();

  if (!key || key !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Key not recognised" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_key", key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
