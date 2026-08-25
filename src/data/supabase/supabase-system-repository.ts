import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyMetric, SystemSnapshot } from "@/domain/system-models";
import type { SystemActionInput } from "@/features/system/system-schema";

const value=(input:unknown)=>Number(input??0);
export class SupabaseSystemRepository {
  constructor(private readonly client:SupabaseClient,readonly userId:string){}
  async initialize(){const{error}=await this.client.rpc("initialize_system_workspace");if(error)throw error;const{error:refreshError}=await this.client.rpc("refresh_smart_notifications");if(refreshError)throw refreshError;}
  async load():Promise<SystemSnapshot>{
    await this.initialize();
    const [areas,goals,notifications,integrations,integrationSyncLogs,analytics,notificationPreferences,planningPreferences]=await Promise.all([
      this.client.from("areas").select("*").order("name"),
      this.client.from("goals").select("*").order("priority").order("deadline"),
      this.client.from("notifications").select("*").is("dismissed_at",null).order("created_at",{ascending:false}).limit(80),
      this.client.from("integration_connections").select("*").order("connector"),
      this.client.from("integration_sync_logs").select("*").order("started_at",{ascending:false}).limit(50),
      this.client.from("personal_os_daily_analytics").select("*").order("day"),
      this.client.from("notification_preferences").select("*").maybeSingle(),
      this.client.from("planning_preferences").select("*").maybeSingle(),
    ]);
    const failure=[areas,goals,notifications,integrations,integrationSyncLogs,analytics,notificationPreferences,planningPreferences].find((entry)=>entry.error)?.error;
    if(failure)throw failure;
    const goalRows=(goals.data??[]).map((row)=>({id:row.id,areaId:row.area_id,title:row.title,description:row.description,status:row.status,horizon:row.horizon,targetValue:value(row.target_value),currentValue:value(row.current_value),unit:row.unit,priority:row.priority,deadline:row.deadline,version:row.version}));
    const metrics:DailyMetric[]=(analytics.data??[]).map((row)=>({day:row.day,completedTasks:value(row.completed_tasks),focusMinutes:value(row.focus_minutes),completedHabits:value(row.completed_habits),habitLogs:value(row.habit_logs)}));
    const notificationRows=(notifications.data??[]).map((row)=>({id:row.id,kind:row.kind,title:row.title,body:row.body,actionUrl:row.action_url,scheduledFor:row.scheduled_for,readAt:row.read_at,createdAt:row.created_at}));
    const n=notificationPreferences.data??{};const p=planningPreferences.data??{};
    const completedHabits=metrics.reduce((sum,row)=>sum+row.completedHabits,0);const loggedHabits=metrics.reduce((sum,row)=>sum+row.habitLogs,0);
    return {
      areas:(areas.data??[]).map((row)=>({id:row.id,name:row.name,description:row.description,color:row.color,active:row.active,version:row.version})),
      goals:goalRows,
      notifications:notificationRows,
      integrations:(integrations.data??[]).map((row)=>({id:row.id,connector:row.connector,status:row.status,capabilities:row.capabilities??[],accountLabel:row.account_label,statusMessage:row.status_message,lastCheckedAt:row.last_checked_at,lastSyncedAt:row.last_synced_at,version:row.version})),
      integrationSyncLogs:(integrationSyncLogs.data??[]).map((row)=>({id:row.id,connectionId:row.connection_id,direction:row.direction,status:row.status,recordsProcessed:value(row.records_processed),message:row.message,startedAt:row.started_at,completedAt:row.completed_at})),
      analytics:metrics,
      notificationPreferences:{inAppEnabled:n.in_app_enabled??true,pushEnabled:n.push_enabled??false,taskReminders:n.task_reminders??true,calendarReminders:n.calendar_reminders??true,habitReminders:n.habit_reminders??true,financeReminders:n.finance_reminders??true,academicReminders:n.academic_reminders??true,learningReminders:n.learning_reminders??true,reminderLeadMinutes:n.reminder_lead_minutes??15},
      planningPreferences:{workdayStart:p.workday_start??"09:00",workdayEnd:p.workday_end??"19:00",deepWorkMinutes:p.deep_work_minutes??90,breakMinutes:p.break_minutes??15,quietHoursStart:p.quiet_hours_start??"22:00",quietHoursEnd:p.quiet_hours_end??"07:00",weekendPlanning:p.weekend_planning??true},
      summary:{activeGoals:goalRows.filter((goal)=>goal.status==="active").length,averageGoalProgress:goalRows.length?Math.round(goalRows.reduce((sum,goal)=>sum+Math.min(100,goal.currentValue/Math.max(1,goal.targetValue)*100),0)/goalRows.length):0,unreadNotifications:notificationRows.filter((item)=>!item.readAt).length,connectedIntegrations:(integrations.data??[]).filter((row)=>row.status==="healthy").length,focusMinutes30d:metrics.reduce((sum,row)=>sum+row.focusMinutes,0),completedTasks30d:metrics.reduce((sum,row)=>sum+row.completedTasks,0),habitConsistency30d:loggedHabits?Math.round(completedHabits/loggedHabits*100):0},
    };
  }
  async act(input:SystemActionInput){const{data,error}=await this.client.rpc("product_system_action",{requested_action:input.action,payload:input.payload,expected_version:"expected_version" in input?input.expected_version:null,request_key:input.idempotency_key});if(error)throw error;return data;}
}
