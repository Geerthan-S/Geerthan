"use client";

import { useState, type FormEvent } from "react";
import type { Habit, HabitInput, HabitMetric } from "@/domain/models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";

const accents: Habit["accent"][] = ["blue", "violet", "amber", "emerald"];

const metricLabels: Record<HabitMetric, string> = {
  boolean: "Yes / no",
  count: "Count",
  duration: "Minutes",
  numeric: "Number",
};

export const habitTemplates: HabitInput[] = [
  {
    name: "Wake up early",
    description: "Up before 06:00",
    metric: "boolean",
    targetValue: 1,
    unit: "",
    accent: "amber",
  },
  {
    name: "Gym",
    description: "Train with intent",
    metric: "boolean",
    targetValue: 1,
    unit: "",
    accent: "emerald",
  },
  {
    name: "Reading",
    description: "Read or learn",
    metric: "duration",
    targetValue: 20,
    unit: "min",
    accent: "violet",
  },
  {
    name: "10k steps",
    description: "Keep moving",
    metric: "count",
    targetValue: 10000,
    unit: "steps",
    accent: "blue",
  },
  {
    name: "Sleep",
    description: "Protect recovery",
    metric: "numeric",
    targetValue: 7.5,
    unit: "hours",
    accent: "violet",
  },
  {
    name: "Plan tomorrow",
    description: "Close the day deliberately",
    metric: "boolean",
    targetValue: 1,
    unit: "",
    accent: "blue",
  },
];

const emptyHabit: HabitInput = {
  name: "",
  description: "",
  metric: "boolean",
  targetValue: 1,
  unit: "",
  accent: "blue",
  reminderTime: null,
};

interface HabitFormDialogProps {
  open: boolean;
  onClose: () => void;
  habit?: Habit;
}

export function HabitFormDialog({ open, onClose, habit }: HabitFormDialogProps) {
  return open ? <HabitForm key={habit?.id ?? "new"} onClose={onClose} habit={habit} /> : null;
}

function HabitForm({ onClose, habit }: { onClose: () => void; habit?: Habit }) {
  const { actions } = useWorkspace();
  const [draft, setDraft] = useState<HabitInput>(habit ?? emptyHabit);
  const [saving, setSaving] = useState(false);
  const isBoolean = draft.metric === "boolean";

  function update<K extends keyof HabitInput>(key: K, value: HabitInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || (!isBoolean && !(draft.targetValue > 0))) return;
    setSaving(true);
    const input = { ...draft, name: draft.name.trim(), description: draft.description.trim() };
    const saved = habit
      ? await actions.updateHabit(habit.id, habit.version ?? 1, {
          name: input.name,
          description: input.description,
          targetValue: input.targetValue,
          unit: input.unit,
          accent: input.accent,
          // Only send the reminder when it changed, so an edit doesn't log a reminder change.
          ...((input.reminderTime ?? null) !== habit.reminderTime
            ? { reminderTime: input.reminderTime ?? null }
            : {}),
        })
      : await actions.createHabit(input);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow={habit ? "Edit habit" : "New habit"}
      title={habit ? habit.name : "What do you want to repeat?"}
    >
      <form onSubmit={submit}>
        {!habit ? (
          <div className="habit-templates" aria-label="Templates">
            {habitTemplates.map((template) => (
              <button type="button" key={template.name} onClick={() => setDraft(template)}>
                {template.name}
              </button>
            ))}
          </div>
        ) : null}
        <label className="field-label" htmlFor="habit-name">
          Name
        </label>
        <input
          id="habit-name"
          className="glass-input"
          value={draft.name}
          maxLength={120}
          required
          onChange={(event) => update("name", event.target.value)}
          placeholder="Cold shower, Reading, 10k steps…"
        />
        <label className="field-label" htmlFor="habit-description">
          Why it matters <span>optional</span>
        </label>
        <input
          id="habit-description"
          className="glass-input"
          value={draft.description}
          maxLength={240}
          onChange={(event) => update("description", event.target.value)}
        />
        <div className="habit-form-grid">
          <label>
            Measured as
            <select
              className="glass-input"
              value={draft.metric}
              disabled={Boolean(habit)}
              title={
                habit
                  ? "The measurement can't change after creation, so past check-ins keep their meaning."
                  : undefined
              }
              onChange={(event) => {
                const metric = event.target.value as HabitMetric;
                setDraft((current) => ({
                  ...current,
                  metric,
                  targetValue: metric === "boolean" ? 1 : current.targetValue,
                  unit: metric === "duration" ? "min" : metric === "boolean" ? "" : current.unit,
                }));
              }}
            >
              {(Object.keys(metricLabels) as HabitMetric[]).map((metric) => (
                <option value={metric} key={metric}>
                  {metricLabels[metric]}
                </option>
              ))}
            </select>
          </label>
          {!isBoolean ? (
            <>
              <label>
                Daily target
                <input
                  className="glass-input"
                  type="number"
                  min={0.1}
                  step="any"
                  required
                  value={draft.targetValue}
                  onChange={(event) => update("targetValue", Number(event.target.value))}
                />
              </label>
              <label>
                Unit
                <input
                  className="glass-input"
                  value={draft.unit}
                  maxLength={40}
                  onChange={(event) => update("unit", event.target.value)}
                  placeholder="steps, hours…"
                />
              </label>
            </>
          ) : null}
        </div>
        <label className="field-label" htmlFor="habit-reminder">
          Reminder <span>optional · sent as a push if the habit is still open</span>
        </label>
        <input
          id="habit-reminder"
          className="glass-input habit-reminder-input"
          type="time"
          value={draft.reminderTime ?? ""}
          onChange={(event) => update("reminderTime", event.target.value || null)}
        />
        <fieldset className="accent-picker">
          <legend className="field-label">Colour</legend>
          {accents.map((accent) => (
            <label key={accent} className={`accent-swatch accent-${accent}`}>
              <input
                type="radio"
                name="habit-accent"
                value={accent}
                checked={draft.accent === accent}
                onChange={() => update("accent", accent)}
              />
              <span className="sr-only">{accent}</span>
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <span>
            {habit
              ? "History is kept when you edit a habit."
              : "You can backfill past days from the month view."}
          </span>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : habit ? "Save changes" : "Create habit"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
