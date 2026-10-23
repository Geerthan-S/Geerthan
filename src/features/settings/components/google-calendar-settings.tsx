"use client";

import { CalendarDays, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import type { IntegrationRecord } from "@/domain/system-models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ui/dialog";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

const callbackMessages: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Google Calendar connected. Your next two weeks of events are imported." },
  denied: { tone: "error", text: "Google access wasn't granted, so nothing was connected." },
  invalid_state: {
    tone: "error",
    text: "That sign-in link expired or came from another session. Try connecting again.",
  },
  no_refresh_token: {
    tone: "error",
    text: "Google didn't grant ongoing access. Remove Personal OS at myaccount.google.com/permissions, then connect again.",
  },
  not_configured: {
    tone: "error",
    text: "Google sign-in isn't set up on the server yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INTEGRATION_ENCRYPTION_KEY).",
  },
  failed: { tone: "error", text: "Connecting failed. Try again in a minute." },
};

function relative(value: string | null) {
  if (!value) return "never";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function GoogleCalendarSettings({
  connection,
  callbackStatus,
  onChanged,
}: {
  connection: IntegrationRecord | undefined;
  callbackStatus: string | null;
  onChanged: () => Promise<void>;
}) {
  const { actions } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(callbackStatus ? (callbackMessages[callbackStatus] ?? null) : null);
  const [confirming, setConfirming] = useState(false);
  const connected = connection?.status === "healthy" || connection?.status === "degraded";

  async function call(path: string, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { imported?: number; error?: string };
      if (!response.ok)
        throw new Error(
          body.error === "not_configured"
            ? "Calendar sync isn't set up on the server."
            : "That didn't work. Try again.",
        );
      setMessage({ tone: "ok", text: success.replace("{n}", String(body.imported ?? 0)) });
      await Promise.all([onChanged(), actions.reload()]);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="settings-form-card">
      <div className="settings-form-heading">
        <CalendarDays />
        <div>
          <span className="eyebrow">Google Calendar</span>
          <h2>{connected ? connection?.accountLabel || "Connected" : "Bring your meetings in"}</h2>
        </div>
      </div>
      <p className="settings-copy">
        {connected
          ? `${connection?.statusMessage ?? ""} Last synced ${relative(connection?.lastSyncedAt ?? null)}.`
          : "Read-only: your next two weeks of timed events appear in Today and Calendar, and the day planner works around them. Nothing is ever written to Google."}
      </p>
      {connection?.status === "error" ? (
        <p className="settings-status is-error">{connection.statusMessage}</p>
      ) : null}
      <div className="settings-form-actions">
        {connected ? (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
              <Unplug size={14} /> Disconnect
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => call("/api/integrations/google/sync", "Synced {n} events.")}
            >
              <RefreshCw size={14} /> {busy ? "Syncing…" : "Sync now"}
            </Button>
          </>
        ) : (
          <>
            <span>You&apos;ll be sent to Google to approve read-only access.</span>
            {/* A full-page navigation, so the OAuth redirect and its cookie work normally. */}
            <a className="button button-primary button-md" href="/api/integrations/google/connect">
              Connect Google Calendar
            </a>
          </>
        )}
      </div>
      {message ? (
        <p
          className={`settings-status is-${message.tone}`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Disconnect Google Calendar?"
        body="Imported events are removed from Personal OS and access is revoked at Google. Your own blocks stay."
        confirmLabel="Disconnect"
        onConfirm={() => call("/api/integrations/google/disconnect", "Disconnected.")}
        onClose={() => setConfirming(false)}
      />
    </GlassPanel>
  );
}
