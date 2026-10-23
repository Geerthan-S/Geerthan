const messages: [code: string, message: string][] = [
  ["version_conflict", "This item changed somewhere else. Reload the page and try again."],
  ["task_not_found", "That task no longer exists."],
  ["project_not_found", "That project no longer exists."],
  ["habit_not_found", "That habit no longer exists or is archived."],
  ["invalid_habit_date_future", "You can't check in for a day that hasn't happened yet."],
  ["invalid_habit_date_too_old", "Check-ins can only be changed for the last year."],
  ["invalid_habit_target", "The daily target must be greater than zero."],
  ["invalid_habit_value", "Check-in values can't be negative."],
  ["projects_user_id_code_key", "Another project already uses that code."],
  ["habits_user_id_name_key", "You already have a habit with that name."],
  ["invalid_timezone", "That timezone isn't recognised."],
  ["invalid_workday_range", "The workday must end after it starts."],
  ["authentication_required", "Your session has ended. Sign in again."],
  ["JWT expired", "Your session has ended. Sign in again."],
  ["Failed to fetch", "You appear to be offline. Your change was not saved."],
];

/** Turns database and network errors into a sentence a person can act on. */
export function friendlyWorkspaceError(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = messages.find(([code]) => raw.includes(code));
  if (match) return match[1];
  return raw || "The workspace update failed.";
}
