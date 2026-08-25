import { z } from "zod";

const id=z.uuid();const key=z.string().trim().min(8).max(180);const date=z.iso.date();
export const systemActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create_area"),payload:z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(1000).default(""),color:z.string().trim().max(30).default("blue")}).strict(),idempotency_key:key}).strict(),
  z.object({action:z.literal("create_goal"),payload:z.object({area_id:id.nullable().default(null),title:z.string().trim().min(1).max(220),description:z.string().trim().max(2000).default(""),horizon:z.enum(["week","month","quarter","year","long_term"]).default("quarter"),target_value:z.number().positive(),current_value:z.number().min(0).default(0),unit:z.string().trim().max(40).default("%"),priority:z.enum(["critical","high","medium","low"]).default("medium"),deadline:date.nullable().default(null)}).strict(),idempotency_key:key}).strict(),
  z.object({action:z.literal("update_goal"),payload:z.object({id,title:z.string().trim().min(1).max(220).optional(),status:z.enum(["planned","active","paused","achieved","cancelled"]).optional(),current_value:z.number().min(0).optional(),deadline:date.nullable().optional()}).strict(),expected_version:z.number().int().positive(),idempotency_key:key}).strict(),
  z.object({action:z.literal("mark_notification_read"),payload:z.object({id}).strict(),idempotency_key:key}).strict(),
  z.object({action:z.literal("mark_all_notifications_read"),payload:z.object({}).strict(),idempotency_key:key}).strict(),
  z.object({action:z.literal("update_notification_preferences"),payload:z.object({in_app_enabled:z.boolean().optional(),push_enabled:z.boolean().optional(),task_reminders:z.boolean().optional(),calendar_reminders:z.boolean().optional(),habit_reminders:z.boolean().optional(),finance_reminders:z.boolean().optional(),academic_reminders:z.boolean().optional(),learning_reminders:z.boolean().optional(),reminder_lead_minutes:z.number().int().min(0).max(10080).optional()}).strict(),idempotency_key:key}).strict(),
  z.object({action:z.literal("upsert_push_subscription"),payload:z.object({endpoint:z.url(),p256dh:z.string().min(20).max(500),auth_key:z.string().min(8).max(300),user_agent:z.string().max(500).default("")}).strict(),idempotency_key:key}).strict(),
]);

export type SystemActionInput=z.infer<typeof systemActionSchema>;
