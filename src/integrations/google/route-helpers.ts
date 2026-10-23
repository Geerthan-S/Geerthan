import "server-only";

import { NextResponse } from "next/server";

export const STATE_COOKIE = "pos_google_oauth";
export const COOKIE_PATH = "/api/integrations/google";

/** Sends the browser back to Settings with a short status code for the banner. */
export function backToSettings(origin: string, status: string) {
  const url = new URL("/settings", origin);
  url.searchParams.set("google", status);
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(STATE_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  return response;
}
