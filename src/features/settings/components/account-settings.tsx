"use client";

import { Bot, Download, LogOut, Trash2, UserRound, Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { IntegrationRecord, PlanningPreferences } from "@/domain/system-models";
import { GoogleCalendarSettings } from "@/features/settings/components/google-calendar-settings";
import {
  deleteMyAccount,
  downloadMyData,
  setMcpWriteAccess,
  signOut,
  updatePlanningPreferences,
  updateProfileSettings,
} from "@/features/settings/account-client";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

type Status = { tone: "ok" | "error"; text: string } | null;

function useSaving() {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  async function run(operation: () => Promise<unknown>, success: string) {
    setSaving(true);
    setStatus(null);
    try {
      await operation();
      setStatus({ tone: "ok", text: success });
      return true;
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "That didn't save." });
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, status, run };
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`settings-status is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
      {status.text}
    </p>
  );
}

function SettingsSection({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <GlassPanel className="settings-form-card">
      <div className="settings-form-heading">
        {icon}
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </GlassPanel>
  );
}

function timezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York"];
  }
}

export function AccountSettings({
  planning,
  onPlanningSaved,
  googleCalendar,
  googleCallbackStatus,
}: {
  planning: PlanningPreferences | null;
  onPlanningSaved: () => Promise<void>;
  googleCalendar: IntegrationRecord | undefined;
  googleCallbackStatus: string | null;
}) {
  const { mode } = useWorkspace();
  if (mode !== "supabase") {
    return (
      <GlassPanel className="settings-form-card">
        <p className="settings-preview-note">
          You&apos;re in local preview mode. Account settings, export and AI access appear once Supabase is
          configured and you sign in.
        </p>
      </GlassPanel>
    );
  }
  return (
    <div className="settings-forms">
      <ProfileSettings />
      {planning ? (
        <PlanningSettings key={JSON.stringify(planning)} initial={planning} onSaved={onPlanningSaved} />
      ) : null}
      <GoogleCalendarSettings
        connection={googleCalendar}
        callbackStatus={googleCallbackStatus}
        onChanged={onPlanningSaved}
      />
      <AiAccessSettings />
      <DataSettings />
    </div>
  );
}

function ProfileSettings() {
  const { state, actions } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState(state.profile.name);
  const [timezone, setTimezone] = useState(state.profile.timezone);
  const [focusHours, setFocusHours] = useState(state.profile.focusTargetMinutes / 60);
  const zones = useMemo(() => timezones(), []);
  const { saving, status, run } = useSaving();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await run(
      () =>
        updateProfileSettings({
          name: name.trim(),
          timezone,
          focusTargetMinutes: Math.round(Math.min(24, Math.max(0, focusHours)) * 60),
        }),
      "Profile saved.",
    );
    if (saved) await actions.reload();
  }

  return (
    <SettingsSection icon={<UserRound />} eyebrow="Account" title={state.profile.email || "Your profile"}>
      <form onSubmit={submit} className="settings-form-grid">
        <label>
          Display name
          <input
            className="glass-input"
            value={name}
            minLength={1}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Timezone
          <select
            className="glass-input"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {zones.includes(timezone) ? null : <option value={timezone}>{timezone}</option>}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Daily focus target (hours)
          <input
            className="glass-input"
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={focusHours}
            onChange={(event) => setFocusHours(Number(event.target.value))}
          />
        </label>
        <div className="settings-form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              await signOut();
              router.replace("/login");
              router.refresh();
            }}
          >
            <LogOut size={14} /> Sign out
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
      <StatusLine status={status} />
    </SettingsSection>
  );
}

function PlanningSettings({
  initial,
  onSaved,
}: {
  initial: PlanningPreferences;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PlanningPreferences>({
    ...initial,
    workdayStart: initial.workdayStart.slice(0, 5),
    workdayEnd: initial.workdayEnd.slice(0, 5),
    quietHoursStart: initial.quietHoursStart.slice(0, 5),
    quietHoursEnd: initial.quietHoursEnd.slice(0, 5),
  });
  const { saving, status, run } = useSaving();

  function update<K extends keyof PlanningPreferences>(key: K, value: PlanningPreferences[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.workdayEnd <= draft.workdayStart) {
      await run(async () => Promise.reject(new Error("The workday must end after it starts.")), "");
      return;
    }
    if (await run(() => updatePlanningPreferences(draft), "Workday saved.")) await onSaved();
  }

  return (
    <SettingsSection icon={<Clock3 />} eyebrow="Planning" title="Workday and quiet hours">
      <form onSubmit={submit} className="settings-form-grid">
        <label>
          Workday starts
          <input
            className="glass-input"
            type="time"
            value={draft.workdayStart}
            onChange={(event) => update("workdayStart", event.target.value)}
          />
        </label>
        <label>
          Workday ends
          <input
            className="glass-input"
            type="time"
            value={draft.workdayEnd}
            onChange={(event) => update("workdayEnd", event.target.value)}
          />
        </label>
        <label>
          Deep work block (min)
          <input
            className="glass-input"
            type="number"
            min={15}
            max={240}
            step={15}
            value={draft.deepWorkMinutes}
            onChange={(event) => update("deepWorkMinutes", Number(event.target.value))}
          />
        </label>
        <label>
          Break (min)
          <input
            className="glass-input"
            type="number"
            min={5}
            max={120}
            step={5}
            value={draft.breakMinutes}
            onChange={(event) => update("breakMinutes", Number(event.target.value))}
          />
        </label>
        <label>
          Quiet hours start
          <input
            className="glass-input"
            type="time"
            value={draft.quietHoursStart}
            onChange={(event) => update("quietHoursStart", event.target.value)}
          />
        </label>
        <label>
          Quiet hours end
          <input
            className="glass-input"
            type="time"
            value={draft.quietHoursEnd}
            onChange={(event) => update("quietHoursEnd", event.target.value)}
          />
        </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={draft.weekendPlanning}
            onChange={(event) => update("weekendPlanning", event.target.checked)}
          />
          Plan weekends too
        </label>
        <div className="settings-form-actions">
          <span>No push notifications are sent during quiet hours.</span>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save workday"}
          </Button>
        </div>
      </form>
      <StatusLine status={status} />
    </SettingsSection>
  );
}

function AiAccessSettings() {
  const { state, actions } = useWorkspace();
  const enabled = state.profile.mcpWriteEnabled;
  const { saving, status, run } = useSaving();

  async function toggle() {
    const saved = await run(
      () => setMcpWriteAccess(!enabled),
      enabled ? "AI assistants are now read-only." : "AI assistants can now make changes.",
    );
    if (saved) await actions.reload();
  }

  return (
    <SettingsSection icon={<Bot />} eyebrow="AI assistants (MCP)" title="What connected assistants may do">
      <p className="settings-copy">
        Assistants connected through MCP can always <strong>read</strong> your workspace. Allowing changes
        lets them create and update tasks, time blocks and habit check-ins. Every change they make is logged
        in Activity, and day plans still wait for your review.
      </p>
      <div className="settings-toggle-row">
        <div>
          <strong>{enabled ? "Read and write" : "Read only"}</strong>
          <small>
            Applies to new connections. This setting can&apos;t protect a leaked sign-in token; sign out
            everywhere if one is exposed.
          </small>
        </div>
        <Button
          variant={enabled ? "secondary" : "primary"}
          disabled={saving}
          aria-pressed={enabled}
          onClick={toggle}
        >
          {enabled ? "Make read-only" : "Allow changes"}
        </Button>
      </div>
      <StatusLine status={status} />
    </SettingsSection>
  );
}

function DataSettings() {
  const router = useRouter();
  const { saving, status, run } = useSaving();
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  return (
    <SettingsSection icon={<Download />} eyebrow="Your data" title="Export or delete">
      <p className="settings-copy">
        Download every record you own as JSON: tasks, projects, habits and check-ins, business, learning,
        academics, goals, notifications and activity history.
      </p>
      <div className="settings-form-actions">
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          <Trash2 size={14} /> Delete account
        </Button>
        <Button
          variant="secondary"
          disabled={saving}
          onClick={() => run(downloadMyData, "Export downloaded.")}
        >
          <Download size={14} /> {saving ? "Preparing…" : "Export my data"}
        </Button>
      </div>
      <StatusLine status={status} />

      <Dialog
        open={deleting}
        onClose={() => {
          setDeleting(false);
          setConfirmation("");
        }}
        eyebrow="Permanent"
        title="Delete your account?"
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (confirmation !== "DELETE") return;
            if (await run(deleteMyAccount, "Account deleted.")) {
              router.replace("/login?deleted=1");
              router.refresh();
            }
          }}
        >
          <p className="dialog-body">
            This erases your account and every record in it, immediately and for good. Export your data first
            if you might want it later.
          </p>
          <label className="field-label" htmlFor="delete-confirmation">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirmation"
            className="glass-input"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <StatusLine status={status} />
          <div className="dialog-actions">
            <span>There is no undo.</span>
            <Button type="submit" variant="danger" disabled={confirmation !== "DELETE" || saving}>
              Delete everything
            </Button>
          </div>
        </form>
      </Dialog>
    </SettingsSection>
  );
}
