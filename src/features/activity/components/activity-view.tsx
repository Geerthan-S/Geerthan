"use client";

import { Activity, Bot, History, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { StatusPill } from "@/shared/components/ui/status-pill";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ActivityView() {
  const { state, actions, mode } = useWorkspace();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Activity log"
        title="A trustworthy system record."
        description="Every meaningful mutation records its actor, source, timestamp, and recovery intent."
        actions={mode === "preview" ? <Button variant="secondary" onClick={() => actions.reset()}><RotateCcw size={14} /> Reset demo data</Button> : <StatusPill tone="green">Live Supabase record</StatusPill>}
      />
      <section className="audit-summary-grid">
        <GlassPanel><ShieldCheck size={19} /><div><strong>Explicit writes</strong><span>Draft changes require commit</span></div></GlassPanel>
        <GlassPanel><History size={19} /><div><strong>{state.activity.filter((item) => item.undoable).length} reversible</strong><span>Recent actions carry undo intent</span></div></GlassPanel>
        <GlassPanel><Activity size={19} /><div><strong>{state.activity.length} events</strong><span>Across web and MCP sources</span></div></GlassPanel>
      </section>
      <GlassPanel className="audit-log-card">
        <div className="audit-log-heading"><span>Event</span><span>Actor</span><span>Source</span><span>Time</span></div>
        <div className="audit-event-list">
          {state.activity.map((item) => (
            <article className="audit-event" key={item.id}>
              <span className="audit-icon">{item.actor === "ChatGPT" ? <Bot size={17} /> : <UserRound size={17} />}</span>
              <div className="audit-copy"><strong>{item.summary}</strong><span>{item.detail}</span></div>
              <div className="audit-actor"><strong>{item.actor}</strong>{item.undoable ? <StatusPill tone="blue">Reversible</StatusPill> : null}</div>
              <code>{item.source}</code>
              <time>{formatTimestamp(item.occurredAt)}</time>
            </article>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
