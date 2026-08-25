import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningSnapshot } from "@/domain/learning-models";

type Row=Record<string,unknown>;
function camel(key:string){return key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase());}
function mapRow<T>(row:Row){return Object.fromEntries(Object.entries(row).map(([key,value])=>[camel(key),value])) as T;}
const numeric=(value:unknown)=>typeof value==="number"?value:Number(value??0);

export class SupabaseLearningRepository {
  constructor(private readonly client:SupabaseClient,private readonly userId:string){}

  async load():Promise<LearningSnapshot>{
    const {error:initializeError}=await this.client.rpc("initialize_learning_academics_workspace");
    if(initializeError&&initializeError.code!=="PGRST202")throw initializeError;
    const tables=["skills","learning_roadmaps","learning_topics","learning_sessions","learning_resources","courses","learning_goals","dsa_problems","subjects","assignments","exams","academic_topics","timetable_entries"] as const;
    const results=await Promise.all(tables.map((table)=>this.client.from(table).select("*").eq("user_id",this.userId).order("created_at",{ascending:false})));
    const attendanceResult=await this.client.from("subject_attendance_summary").select("*").eq("user_id",this.userId);
    const failure=results.find((result)=>result.error)?.error??attendanceResult.error;if(failure)throw failure;
    const rows=results.map((result)=>(result.data??[]) as Row[]);
    const [skillsRaw,roadmapsRaw,topicsRaw,sessionsRaw,resourcesRaw,coursesRaw,goalsRaw,problemsRaw,subjectsRaw,assignmentsRaw,examsRaw,academicTopicsRaw,timetableRaw]=rows;
    const skills=skillsRaw.map(mapRow<LearningSnapshot["skills"][number]>);const topics=topicsRaw.map(mapRow<LearningSnapshot["topics"][number]>);
    const sessions=sessionsRaw.map(mapRow<LearningSnapshot["sessions"][number]>);const goals=goalsRaw.map(mapRow<LearningSnapshot["goals"][number]>);
    const problems=problemsRaw.map(mapRow<LearningSnapshot["problems"][number]>);const attendance=((attendanceResult.data??[]) as Row[]).map(mapRow<LearningSnapshot["attendance"][number]>);
    const assignments=assignmentsRaw.map(mapRow<LearningSnapshot["assignments"][number]>);const exams=examsRaw.map(mapRow<LearningSnapshot["exams"][number]>);
    const solvedDates=new Set(problems.map((problem)=>problem.solvedAt.slice(0,10)));let cursor=new Date();let streak=0;
    while(solvedDates.has(cursor.toISOString().slice(0,10))&&streak<366){streak+=1;cursor=new Date(cursor.getTime()-86_400_000);}
    if(streak===0){cursor=new Date(Date.now()-86_400_000);while(solvedDates.has(cursor.toISOString().slice(0,10))&&streak<366){streak+=1;cursor=new Date(cursor.getTime()-86_400_000);}}
    const targetGoal=goals.find((goal)=>goal.unit==="problems");const target=targetGoal?.targetValue??300;const remaining=Math.max(0,target-problems.length);
    const days=targetGoal?.deadline?Math.max(1,Math.ceil((Date.parse(targetGoal.deadline)-Date.now())/86_400_000)):remaining;
    const averageMastery=topics.length?topics.reduce((sum,topic)=>sum+numeric(topic.mastery),0)/topics.length:0;
    const hardShare=problems.length?(problems.filter((problem)=>problem.difficulty!=="easy").length/problems.length)*100:0;
    const readiness=Math.round(Math.min(100,averageMastery*.55+Math.min(100,problems.length/Math.max(1,target)*100)*.3+hardShare*.15));
    const now=Date.now();
    return {
      skills,roadmaps:roadmapsRaw.map(mapRow<LearningSnapshot["roadmaps"][number]>),topics,sessions,
      resources:resourcesRaw.map(mapRow<LearningSnapshot["resources"][number]>),courses:coursesRaw.map(mapRow<LearningSnapshot["courses"][number]>),goals,problems,
      subjects:subjectsRaw.map(mapRow<LearningSnapshot["subjects"][number]>),attendance,assignments,exams,
      academicTopics:academicTopicsRaw.map(mapRow<LearningSnapshot["academicTopics"][number]>),timetable:timetableRaw.map(mapRow<LearningSnapshot["timetable"][number]>),
      growthSummary:{learningMinutes:sessions.reduce((sum,session)=>sum+numeric(session.durationMinutes),0),activeSkills:skills.filter((skill)=>skill.status==="active").length,revisionsDue:topics.filter((topic)=>topic.nextRevisionOn&&Date.parse(topic.nextRevisionOn)<=now).length,averageMastery:Math.round(averageMastery)},
      dsaSummary:{solved:problems.length,easy:problems.filter((problem)=>problem.difficulty==="easy").length,medium:problems.filter((problem)=>problem.difficulty==="medium").length,hard:problems.filter((problem)=>problem.difficulty==="hard").length,streak,target,remaining,dailyPace:Math.ceil(remaining/days),weakTopics:topics.filter((topic)=>topic.weak).map((topic)=>topic.title),interviewReadiness:readiness},
      academicSummary:{lowAttendance:attendance.filter((item)=>numeric(item.attendancePercentage)<numeric(item.attendanceTarget)),dueAssignments:assignments.filter((assignment)=>!["submitted","graded"].includes(assignment.status)&&assignment.dueAt&&Date.parse(assignment.dueAt)<now+7*86_400_000).length,upcomingExams:exams.filter((exam)=>Date.parse(exam.startsAt)>=now&&Date.parse(exam.startsAt)<now+30*86_400_000).length,credits:subjectsRaw.reduce((sum,row)=>sum+numeric(row.credits),0)},
    };
  }

  async action(action:string,payload:Record<string,unknown>,expectedVersion:number|null,idempotencyKey:string){
    const {data,error}=await this.client.rpc("product_learning_action",{requested_action:action,payload,expected_version:expectedVersion,request_key:idempotencyKey});if(error)throw error;return data;
  }
}
