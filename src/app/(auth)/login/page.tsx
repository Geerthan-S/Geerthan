import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/data/supabase/config";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <SignInForm configured={isSupabaseConfigured()} />;
}
