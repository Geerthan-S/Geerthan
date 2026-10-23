"use client";
import { useSearchParams } from "next/navigation";
import { Cable, CheckCircle2, ShieldCheck } from "lucide-react";
import { connectorDefinitions } from "@/integrations/catalog";
import { AccountSettings } from "@/features/settings/components/account-settings";
import { PageHeader } from "@/features/workspace/components/page-header";
import { useSystemData } from "@/features/system/use-system-data";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
const label = (value: string) => value.replaceAll("_", " ");
export function SettingsView() {
  const { data, error, reload } = useSystemData();
  const googleStatus = useSearchParams().get("google");
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Settings"
        title="Your account, preferences and connections."
        description="Edit how your days are shaped, choose what AI assistants may do, and take your data with you."
      />
      {error ? <div className="workspace-error">{error}</div> : null}
      <AccountSettings
        planning={data?.planningPreferences ?? null}
        onPlanningSaved={reload}
        googleCalendar={data?.integrations.find((item) => item.connector === "google_calendar")}
        googleCallbackStatus={googleStatus}
      />
      <div className="settings-assurance">
        <GlassPanel>
          <ShieldCheck />
          <div>
            <strong>User-scoped access</strong>
            <span>Supabase Auth and RLS protect every persisted record.</span>
          </div>
        </GlassPanel>
        <GlassPanel>
          <Cable />
          <div>
            <strong>Adapters only</strong>
            <span>External records cross typed integration boundaries.</span>
          </div>
        </GlassPanel>
        <GlassPanel>
          <CheckCircle2 />
          <div>
            <strong>Truthful status</strong>
            <span>Unconfigured connectors cannot report successful syncs.</span>
          </div>
        </GlassPanel>
      </div>
      <div className="settings-main-grid">
        <GlassPanel className="work-hub-panel">
          <div className="module-heading">
            <div>
              <span className="eyebrow">External connectors</span>
              <h2>Integration status</h2>
            </div>
            <Cable />
          </div>
          <div className="connector-list">
            {connectorDefinitions.map((definition) => {
              const connection = data?.integrations.find((item) => item.connector === definition.id);
              const sync = data?.integrationSyncLogs.find((item) => item.connectionId === connection?.id);
              return (
                <article key={definition.id}>
                  <div className="connector-mark">{definition.name.slice(0, 1)}</div>
                  <div>
                    <strong>{definition.name}</strong>
                    <p>{definition.boundary}</p>
                    <small>
                      {definition.capabilities.join(" + ")} ·{" "}
                      {sync?.message ?? connection?.statusMessage ?? "Migration pending"}
                    </small>
                  </div>
                  <span className={`connector-status ${connection?.status ?? "not_configured"}`}>
                    {label(connection?.status ?? "not_configured")}
                  </span>
                </article>
              );
            })}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
