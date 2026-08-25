import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DomainActionRepository } from "@/data/repositories/domain-action-repository";
import type { WriteToolName } from "@/mcp/tools";

const rpcNames: Record<WriteToolName, string> = {
  create_task: "domain_create_task",
  update_task: "domain_update_task",
  complete_task: "domain_complete_task",
  reschedule_task: "domain_reschedule_task",
  start_work_session: "domain_start_work_session",
  end_work_session: "domain_end_work_session",
  log_habit: "domain_log_habit",
  create_time_block: "domain_create_time_block",
  update_time_block: "domain_update_time_block",
  draft_day_plan: "domain_draft_day_plan",
  commit_change_set: "domain_commit_change_set",
  discard_change_set: "domain_discard_change_set",
  undo_change_set: "domain_undo_change_set",
};

function rpcArguments(action: WriteToolName, input: Record<string, unknown>) {
  switch (action) {
    case "create_task": return { task_title: input.title, task_priority: input.priority, task_project_id: input.project_id, task_due_at: input.due_at, task_estimate_minutes: input.estimate_minutes, task_tags: input.tags, request_key: input.idempotency_key };
    case "update_task": return { target_task: input.task_id, expected_version: input.expected_version, task_patch: input.patch, request_key: input.idempotency_key };
    case "complete_task": return { target_task: input.task_id, expected_version: input.expected_version, request_key: input.idempotency_key };
    case "reschedule_task": return { target_task: input.task_id, expected_version: input.expected_version, task_start: input.starts_at, task_end: input.ends_at, request_key: input.idempotency_key };
    case "start_work_session": return { target_task: input.task_id, expected_task_version: input.expected_task_version, request_key: input.idempotency_key };
    case "end_work_session": return { target_session: input.session_id, expected_version: input.expected_version, session_outcome: input.outcome, request_key: input.idempotency_key };
    case "log_habit": return { target_habit: input.habit_id, target_date: input.date, checkin_value: input.value, checkin_note: input.note, expected_log_version: input.expected_log_version, request_key: input.idempotency_key };
    case "create_time_block": return { block_title: input.title, block_kind: input.kind, block_start: input.starts_at, block_end: input.ends_at, block_notes: input.notes, request_key: input.idempotency_key };
    case "update_time_block": return { target_block: input.time_block_id, expected_version: input.expected_version, block_patch: input.patch, request_key: input.idempotency_key };
    case "draft_day_plan": return { target_date: input.date, include_overdue: input.include_overdue, request_key: input.idempotency_key };
    case "commit_change_set":
    case "discard_change_set":
    case "undo_change_set": return { target_change_set: input.change_set_id, request_key: input.idempotency_key };
  }
}

export class SupabaseDomainActionRepository implements DomainActionRepository {
  constructor(
    private readonly client: SupabaseClient,
    readonly userId: string,
  ) {}

  async execute(action: WriteToolName, input: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(rpcNames[action], rpcArguments(action, input));
    if (error) throw error;
    return data;
  }
}
