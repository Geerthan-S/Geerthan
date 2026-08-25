"use client";
import Link from "next/link";
import { Bell, CheckCheck, Clock3, Radio } from "lucide-react";
import { PageHeader } from "@/features/workspace/components/page-header";
import { useSystemData } from "@/features/system/use-system-data";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

function applicationKey(value:string){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);return Uint8Array.from(atob(padded),char=>char.charCodeAt(0));}

export function NotificationsView(){
  const{data,error,saving,act}=useSystemData();
  async function enablePush(){
    const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if(!key||!("serviceWorker"in navigator)||!("PushManager"in window))return;
    if(await Notification.requestPermission()!=="granted")return;
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
    const json=subscription.toJSON();
    if(!json.endpoint||!json.keys?.p256dh||!json.keys.auth)return;
    await act("upsert_push_subscription",{endpoint:json.endpoint,p256dh:json.keys.p256dh,auth_key:json.keys.auth,user_agent:navigator.userAgent});
    await act("update_notification_preferences",{push_enabled:true});
  }
  return <div className="page-stack"><PageHeader eyebrow="Notification center" title="Only signals that change what you do." description="Task, schedule, habit, finance, academic and learning reminders with quiet-hour controls." actions={<Button disabled={saving||!data?.summary.unreadNotifications} onClick={()=>act("mark_all_notifications_read",{})}><CheckCheck size={14}/>Mark all read</Button>}/>{error?<div className="workspace-error">{error}</div>:null}<div className="notification-layout"><GlassPanel className="notification-feed"><div className="module-heading"><div><span className="eyebrow">Inbox</span><h2>{data?.summary.unreadNotifications??0} unread signals</h2></div><Bell/></div>{data?.notifications.map((item)=><article className={item.readAt?"is-read":""} key={item.id}><span className={`notification-kind ${item.kind}`}>{item.kind}</span><div><strong>{item.title}</strong><p>{item.body}</p><small><Clock3 size={11}/>{new Date(item.scheduledFor??item.createdAt).toLocaleString()}</small></div><div>{item.actionUrl?<Link href={item.actionUrl}>Open</Link>:null}{!item.readAt?<button onClick={()=>act("mark_notification_read",{id:item.id})}>Mark read</button>:null}</div></article>)}</GlassPanel><GlassPanel className="notification-controls"><span className="eyebrow">Delivery</span><h2>Reminder policy</h2><p>Browser push requires permission and VAPID keys. Private workspace pages are never stored in the offline cache.</p>{process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?<Button variant="secondary" onClick={enablePush} disabled={saving}><Radio size={14}/>Enable browser push</Button>:<div className="push-unavailable">VAPID configuration required</div>}{data?<><Toggle label="In-app notifications" enabled={data.notificationPreferences.inAppEnabled} onChange={(value)=>act("update_notification_preferences",{in_app_enabled:value})}/><Toggle label="Browser push" enabled={data.notificationPreferences.pushEnabled} onChange={(value)=>act("update_notification_preferences",{push_enabled:value})}/><Toggle label="Task reminders" enabled={data.notificationPreferences.taskReminders} onChange={(value)=>act("update_notification_preferences",{task_reminders:value})}/><Toggle label="Habit reminders" enabled={data.notificationPreferences.habitReminders} onChange={(value)=>act("update_notification_preferences",{habit_reminders:value})}/><Toggle label="Academic warnings" enabled={data.notificationPreferences.academicReminders} onChange={(value)=>act("update_notification_preferences",{academic_reminders:value})}/></>:null}</GlassPanel></div></div>;
}
function Toggle({label,enabled,onChange}:{label:string;enabled:boolean;onChange:(value:boolean)=>void}){return <button className="preference-toggle" onClick={()=>onChange(!enabled)}><span>{label}</span><i className={enabled?"is-on":""}><b/></i></button>}
