import type { ConnectorId } from "@/integrations/contracts";

export interface AreaRecord { id:string; name:string; description:string; color:string; active:boolean; version:number }
export interface GoalRecord { id:string; areaId:string|null; title:string; description:string; status:"planned"|"active"|"paused"|"achieved"|"cancelled"; horizon:"week"|"month"|"quarter"|"year"|"long_term"; targetValue:number; currentValue:number; unit:string; priority:"critical"|"high"|"medium"|"low"; deadline:string|null; version:number }
export interface NotificationRecord { id:string; kind:string; title:string; body:string; actionUrl:string; scheduledFor:string|null; readAt:string|null; createdAt:string }
export interface IntegrationRecord { id:string; connector:ConnectorId; status:"not_configured"|"disconnected"|"healthy"|"degraded"|"error"; capabilities:string[]; accountLabel:string; statusMessage:string; lastCheckedAt:string|null; lastSyncedAt:string|null; version:number }
export interface IntegrationSyncRecord { id:string; connectionId:string; direction:"pull"|"push"; status:"started"|"completed"|"failed"|"skipped"; recordsProcessed:number; message:string; startedAt:string; completedAt:string|null }
export interface DailyMetric { day:string; completedTasks:number; focusMinutes:number; completedHabits:number; habitLogs:number }
export interface NotificationPreferences { inAppEnabled:boolean; pushEnabled:boolean; taskReminders:boolean; calendarReminders:boolean; habitReminders:boolean; financeReminders:boolean; academicReminders:boolean; learningReminders:boolean; reminderLeadMinutes:number }
export interface PlanningPreferences { workdayStart:string; workdayEnd:string; deepWorkMinutes:number; breakMinutes:number; quietHoursStart:string; quietHoursEnd:string; weekendPlanning:boolean }
export interface SystemSnapshot {
  areas:AreaRecord[];
  goals:GoalRecord[];
  notifications:NotificationRecord[];
  integrations:IntegrationRecord[];
  integrationSyncLogs:IntegrationSyncRecord[];
  analytics:DailyMetric[];
  notificationPreferences:NotificationPreferences;
  planningPreferences:PlanningPreferences;
  summary:{ activeGoals:number; averageGoalProgress:number; unreadNotifications:number; connectedIntegrations:number; focusMinutes30d:number; completedTasks30d:number; habitConsistency30d:number };
}
