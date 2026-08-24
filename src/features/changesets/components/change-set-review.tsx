"use client";

import { Check, FileClock, ShieldCheck, X } from "lucide-react";
import type { ChangeSet } from "@/domain/models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";
import { StatusPill } from "@/shared/components/ui/status-pill";

export function ChangeSetReview({ changeSet }: { changeSet: ChangeSet }) {
  const { actions } = useWorkspace();

  return (
    <GlassPanel className="change-set-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow"><FileClock size={14} /> Draft plan</span>
          <h2>{changeSet.title}</h2>
        </div>
        <StatusPill tone="violet">Review required</StatusPill>
      </div>
      <p className="muted-copy">{changeSet.rationale}</p>
      <div className="change-list">
        {changeSet.operations.map((operation) => (
          <div className="change-item" key={operation.id}>
            <span className="change-number">{changeSet.operations.indexOf(operation) + 1}</span>
            <div>
              <strong>{operation.summary}</strong>
              <small>{operation.action} · {operation.entity.replace("_", " ")}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="safe-change-note">
        <ShieldCheck size={16} />
        Nothing changes until you commit this draft.
      </div>
      <div className="change-actions">
        <Button variant="ghost" onClick={() => actions.discardChangeSet(changeSet.id)}>
          <X size={15} /> Discard
        </Button>
        <Button onClick={() => actions.commitChangeSet(changeSet.id)}>
          <Check size={15} /> Commit {changeSet.operations.length} changes
        </Button>
      </div>
    </GlassPanel>
  );
}
