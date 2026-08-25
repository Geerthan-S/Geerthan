"use client";
import { AlertTriangle, BrainCircuit, BriefcaseBusiness, CalendarClock, CheckCircle2, GraduationCap, TimerReset, WalletCards } from "lucide-react";
import { useEffect,useState } from "react";
import type { BusinessSnapshot } from "@/domain/business-models";
import type { LearningSnapshot } from "@/domain/learning-models";
import { useWorkspace } from "@/features/workspace/workspace-provider";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

export function ReviewIntelligence(){
  const{state}=useWorkspace();const[now]=useState(()=>Date.now());const[product,setProduct]=useState<{business:BusinessSnapshot;learning:LearningSnapshot}|null>(null);
  useEffect(()=>{let active=true;Promise.all([fetch("/api/product/business",{cache:"no-store"}),fetch("/api/product/learning",{cache:"no-store"})]).then(async([business,learning])=>{if(!business.ok||!learning.ok)return null;return{business:(await business.json()).data,learning:(await learning.json()).data};}).then(value=>{if(active&&value)setProduct(value);}).catch(()=>undefined);return()=>{active=false;};},[]);
  if(!product)return null;
  const completed7=state.tasks.filter((task)=>task.completedAt&&new Date(task.completedAt).getTime()>=now-7*86400000).length;
  const overdue=state.tasks.filter((task)=>task.status!=="completed"&&task.dueAt&&new Date(task.dueAt).getTime()<now).length;
  const planned=state.tasks.filter((task)=>task.scheduledStart&&new Date(task.scheduledStart).getTime()>=now-7*86400000).reduce((sum,task)=>sum+task.estimateMinutes,0);
  const actual=state.sessions.filter((session)=>new Date(session.startedAt).getTime()>=now-7*86400000).reduce((sum,session)=>sum+session.durationMinutes,0);
  const signals=[
    {icon:BriefcaseBusiness,label:"Project velocity",value:`${completed7} tasks`,detail:"completed this week"},
    {icon:AlertTriangle,label:"Overdue trend",value:String(overdue),detail:"open past deadline"},
    {icon:TimerReset,label:"Planned vs actual",value:`${planned} / ${actual}m`,detail:"scheduled / focused"},
    {icon:WalletCards,label:"Collections",value:`₹${Math.round(product.business.summary.collected/1000)}k`,detail:`₹${Math.round(product.business.summary.outstanding/1000)}k pending`},
    {icon:BrainCircuit,label:"Learning hours",value:`${Math.round(product.learning.growthSummary.learningMinutes/60)}h`,detail:`${product.learning.growthSummary.revisionsDue} revisions due`},
    {icon:CheckCircle2,label:"DSA evidence",value:String(product.learning.dsaSummary.solved),detail:`${product.learning.dsaSummary.dailyPace}/day target pace`},
    {icon:GraduationCap,label:"Attendance",value:String(product.learning.academicSummary.lowAttendance.length),detail:"subjects below target"},
    {icon:CalendarClock,label:"Academic load",value:String(product.learning.academicSummary.dueAssignments+product.learning.academicSummary.upcomingExams),detail:"deadlines and exams"},
  ];
  const wins=[completed7?`${completed7} work items closed this week`:"A quieter completion week",product.learning.dsaSummary.streak?`${product.learning.dsaSummary.streak}-day DSA streak`:"DSA record is ready",product.business.summary.collected?`₹${Math.round(product.business.summary.collected).toLocaleString("en-IN")} collected`:"Finance record is current"];
  const bottlenecks=[overdue?`${overdue} overdue work items`:"No overdue work",product.business.summary.outstanding?`₹${Math.round(product.business.summary.outstanding).toLocaleString("en-IN")} pending collections`:"Collections are clear",product.learning.academicSummary.lowAttendance.length?`${product.learning.academicSummary.lowAttendance.length} attendance risks`:"Attendance is protected"];
  return <><div className="review-signal-grid">{signals.map(item=>{const Icon=item.icon;return <GlassPanel key={item.label}><Icon/><div><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div></GlassPanel>})}</div><div className="review-grid"><GlassPanel><span className="eyebrow">Weekly review</span><h2>Wins</h2>{wins.map(item=><p key={item}><CheckCircle2 size={12}/>{item}</p>)}</GlassPanel><GlassPanel><span className="eyebrow">Bottlenecks</span><h2>Pressure to reduce</h2>{bottlenecks.map(item=><p key={item}><AlertTriangle size={12}/>{item}</p>)}</GlassPanel><GlassPanel><span className="eyebrow">Next priorities</span><h2>What the record suggests</h2><p><BriefcaseBusiness size={12}/>Close the highest-risk delivery item first.</p><p><WalletCards size={12}/>Follow up on the nearest unpaid invoice.</p><p><BrainCircuit size={12}/>Use the next free block for the weakest revision topic.</p></GlassPanel></div></>;
}
