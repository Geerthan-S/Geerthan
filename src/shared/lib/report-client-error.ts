"use client";

/** Sends a browser-side error to the app's own log endpoint without blocking the UI. */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({
      message: (error.message || "Unknown client error").slice(0, 500),
      digest: error.digest,
      path: window.location.pathname,
    });
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/telemetry/client-error", blob)) {
      void fetch("/api/telemetry/client-error", { method: "POST", body, keepalive: true });
    }
  } catch {
    // Never let reporting throw from inside an error boundary.
  }
}
