import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/data/supabase/config";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const notices: Record<string, string> = {
  deleted: "Your account and all of its data were deleted.",
  auth_callback_failed: "That sign-in link didn't work. Try signing in again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const notice = params.deleted
    ? notices.deleted
    : typeof params.error === "string"
      ? notices[params.error]
      : undefined;
  return <SignInForm configured={isSupabaseConfigured()} notice={notice} />;
}
