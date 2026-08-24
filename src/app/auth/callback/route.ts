import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/data/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = new URL("/", url.origin);
  const supabase = await createSupabaseServerClient();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(destination);
  }

  destination.pathname = "/login";
  destination.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(destination);
}
