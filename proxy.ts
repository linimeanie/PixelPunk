import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_key";
const PUBLIC_PATHS = ["/unlock", "/api/unlock", "/self-serve", "/api/self-serve", "/api/typeform-webhook"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const key = req.cookies.get(COOKIE_NAME)?.value;
  if (key && key === process.env.ADMIN_SECRET) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
