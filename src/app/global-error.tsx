"use client";

import { useEffect } from "react";
import { reportClientError } from "@/shared/lib/report-client-error";

// Replaces the root layout when it fails, so it cannot rely on globals.css.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0d1117",
          color: "#f2f5f8",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Something went wrong · Personal OS</title>
        <main role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Personal OS hit an unexpected error.</h1>
          <p style={{ color: "#a9b2c0", lineHeight: 1.6 }}>
            Your data is safe. Reload to try again.
            {error.digest ? (
              <>
                <br />
                Reference: {error.digest}
              </>
            ) : null}
          </p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              color: "#0d1117",
              background: "#7899f7",
              border: 0,
              borderRadius: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
