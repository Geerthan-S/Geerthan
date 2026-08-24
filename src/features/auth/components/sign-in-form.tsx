"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/data/supabase/client";
import { Button } from "@/shared/components/ui/button";

export function SignInForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="login-page">
      <div className="login-orb login-orb-one" />
      <div className="login-orb login-orb-two" />
      <section className="login-card glass-panel">
        <div className="login-brand"><span className="brand-mark"><BriefcaseBusiness size={19} /></span><span><strong>Personal OS</strong><small>Work command</small></span></div>
        <div className="login-copy"><span className="eyebrow"><LockKeyhole size={14} /> Private workspace</span><h1>Return to focused work.</h1><p>Your projects, plans, and activity stay behind your authenticated Supabase workspace.</p></div>
        {configured ? (
          <form onSubmit={signIn} className="login-form">
            <label>Email<input className="glass-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input className="glass-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            {message ? <p className="form-error">{message}</p> : null}
            <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<ArrowRight size={15} /></Button>
          </form>
        ) : (
          <div className="preview-access"><strong>Preview mode is ready.</strong><p>Connect Supabase environment keys to activate account sign-in. Until then, the complete seeded workspace runs locally.</p><Link href="/" className="button button-primary button-md">Enter preview <ArrowRight size={15} /></Link></div>
        )}
        <small className="login-footnote">Draft changes are always reviewed before commit.</small>
      </section>
    </main>
  );
}
