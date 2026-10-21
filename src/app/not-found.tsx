import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="workspace-gate">
      <div className="workspace-gate-card glass-panel">
        <span className="eyebrow">404</span>
        <h1>That page doesn&apos;t exist.</h1>
        <p>The link may be old, or the item was deleted.</p>
        <div className="workspace-gate-actions">
          <Link className="button button-primary button-md" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
