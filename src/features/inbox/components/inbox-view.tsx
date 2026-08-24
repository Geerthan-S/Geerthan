"use client";

import { ArrowRight, Check, Inbox, Lightbulb, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function InboxView() {
  const { state, actions } = useWorkspace();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const open = state.inbox.filter((item) => !item.triaged);
  const processed = state.inbox.filter((item) => item.triaged);

  async function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await actions.addCapture(title.trim(), note.trim());
    setTitle("");
    setNote("");
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Inbox / Capture" title="Capture fast. Clarify later." description="A trusted landing place for loose tasks, follow-ups, and ideas before they become commitments." />
      <div className="inbox-layout">
        <GlassPanel className="inbox-capture-card">
          <div className="capture-illustration"><Lightbulb size={26} /></div>
          <span className="eyebrow">Zero-friction capture</span>
          <h2>What just crossed your mind?</h2>
          <form onSubmit={capture}>
            <input className="glass-input capture-title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Write the thought as it is…" />
            <textarea className="glass-input" value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Optional context, link, or next question" />
            <Button type="submit"><Plus size={15} /> Add to inbox</Button>
          </form>
          <p>Capture creates an audit event. It does not silently schedule work.</p>
        </GlassPanel>

        <GlassPanel className="inbox-list-card">
          <div className="section-heading"><div><span className="eyebrow"><Inbox size={14} /> Needs clarity</span><h2>{open.length} unprocessed</h2></div></div>
          <div className="inbox-items">
            {open.map((item) => (
              <article className="inbox-item" key={item.id}>
                <span className="inbox-bullet" />
                <div><strong>{item.title}</strong>{item.note ? <p>{item.note}</p> : null}<small>{relativeTime(item.createdAt)}</small></div>
                <Button variant="secondary" size="sm" onClick={() => actions.promoteCapture(item.id)}>Make task <ArrowRight size={13} /></Button>
              </article>
            ))}
            {!open.length ? <div className="empty-state"><span className="empty-icon"><Check size={20} /></span><h3>Inbox cleared.</h3><p>Everything captured has been clarified.</p></div> : null}
          </div>
          {processed.length ? <div className="processed-note"><Check size={14} /> {processed.length} item{processed.length === 1 ? "" : "s"} converted to tasks</div> : null}
        </GlassPanel>
      </div>
    </div>
  );
}
