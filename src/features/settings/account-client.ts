"use client";

import { createSupabaseBrowserClient } from "@/data/supabase/client";
import type { PlanningPreferences } from "@/domain/system-models";
import { friendlyWorkspaceError } from "@/features/workspace/friendly-error";

function client() {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) throw new Error("Account settings need a configured Supabase project.");
  return supabase;
}

async function rpc<T>(name: string, parameters: Record<string, unknown> = {}) {
  const { data, error } = await client().rpc(name, parameters);
  if (error) throw new Error(friendlyWorkspaceError(new Error(error.message)));
  return data as T;
}

export function updateProfileSettings(input: { name: string; timezone: string; focusTargetMinutes: number }) {
  return rpc("update_profile_settings", {
    profile_display_name: input.name,
    profile_timezone: input.timezone,
    profile_focus_target_minutes: input.focusTargetMinutes,
  });
}

export function updatePlanningPreferences(input: PlanningPreferences) {
  return rpc("update_planning_preferences", {
    pref_workday_start: input.workdayStart,
    pref_workday_end: input.workdayEnd,
    pref_deep_work_minutes: input.deepWorkMinutes,
    pref_break_minutes: input.breakMinutes,
    pref_quiet_hours_start: input.quietHoursStart,
    pref_quiet_hours_end: input.quietHoursEnd,
    pref_weekend_planning: input.weekendPlanning,
  });
}

export function setMcpWriteAccess(enabled: boolean) {
  return rpc<boolean>("set_mcp_write_access", { write_enabled: enabled });
}

/** Downloads everything the signed-in user owns as one JSON file. */
export async function downloadMyData() {
  const data = await rpc<Record<string, unknown>>("export_my_data");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `personal-os-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function signOut() {
  await client().auth.signOut();
}

/** Permanently deletes the account and all of its data, then clears the local session. */
export async function deleteMyAccount() {
  await rpc("delete_my_account");
  await client()
    .auth.signOut({ scope: "local" })
    .catch(() => undefined);
}
