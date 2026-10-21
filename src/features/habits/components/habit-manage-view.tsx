"use client";

import { ArchiveRestore, ArrowDown, ArrowUp, Archive, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { Habit } from "@/domain/models";
import { HabitFormDialog } from "@/features/habits/components/habit-form-dialog";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/ui/dialog";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

function describe(habit: Habit) {
  if (habit.metric === "boolean") return "Yes / no each day";
  return `Target ${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""} a day`;
}

export function HabitManageView() {
  const { state, actions, history } = useWorkspace();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [archiving, setArchiving] = useState<Habit | null>(null);
  const [archived, setArchived] = useState<Habit[]>([]);

  useEffect(() => {
    let active = true;
    history
      .loadArchivedHabits()
      .then((habits) => active && setArchived(habits))
      .catch(() => active && setArchived([]));
    return () => {
      active = false;
    };
  }, [history, state.habits]);

  function move(index: number, direction: -1 | 1) {
    const order = state.habits.map((habit) => habit.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    void actions.reorderHabits(order);
  }

  return (
    <div className="page-stack">
      <GlassPanel className="habit-manage-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Your habits</span>
            <h2>Order, edit or archive</h2>
          </div>
        </div>
        <ul className="habit-manage-list">
          {state.habits.map((habit, index) => (
            <li key={habit.id} className={`habit-${habit.accent}`}>
              <span className="habit-manage-dot" aria-hidden />
              <div>
                <strong>{habit.name}</strong>
                <small>{describe(habit)}</small>
              </div>
              <div className="habit-manage-actions">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${habit.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${habit.name} down`}
                  disabled={index === state.habits.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${habit.name}`}
                  onClick={() => setEditing(habit)}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Archive ${habit.name}`}
                  onClick={() => setArchiving(habit)}
                >
                  <Archive size={15} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </GlassPanel>

      {archived.length ? (
        <GlassPanel className="habit-manage-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Archived</span>
              <h2>Paused habits keep their history</h2>
            </div>
          </div>
          <ul className="habit-manage-list">
            {archived.map((habit) => (
              <li key={habit.id} className={`habit-${habit.accent} is-archived`}>
                <span className="habit-manage-dot" aria-hidden />
                <div>
                  <strong>{habit.name}</strong>
                  <small>{describe(habit)}</small>
                </div>
                <div className="habit-manage-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => actions.setHabitActive(habit.id, true)}
                  >
                    <ArchiveRestore size={14} /> Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </GlassPanel>
      ) : null}

      <HabitFormDialog
        open={Boolean(editing)}
        habit={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={Boolean(archiving)}
        title={`Archive ${archiving?.name ?? "habit"}?`}
        body="It disappears from your daily check-in and month grid. Its history is kept and you can restore it any time."
        confirmLabel="Archive"
        onConfirm={async () => {
          if (archiving) await actions.setHabitActive(archiving.id, false);
        }}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}
