import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, isPasswordValid } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = String(body?.password || "");

    if (!isPasswordValid(password)) {
      return NextResponse.json({ error: "Hibás jelszó." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Sikertelen bejelentkezés." }, { status: 400 });
  }
}
