"use client";

import { useEffect } from "react";
import { reportClientError } from "@/shared/lib/report-client-error";

export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="page-stack">
      <div className="workspace-gate-card glass-panel route-error" role="alert">
        <span className="eyebrow">Something went wrong</span>
        <h1>This page couldn&apos;t load.</h1>
        <p>
          Your data is safe; nothing was changed. Try again, or go back to your dashboard.
          {error.digest ? <small>Reference: {error.digest}</small> : null}
        </p>
        <div className="workspace-gate-actions">
          <a className="button button-secondary button-md" href="/dashboard">
            Dashboard
          </a>
          <button className="button button-primary button-md" onClick={() => retry()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
