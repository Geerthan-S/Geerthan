import type { WorkspaceReadRepository } from "@/data/repositories/workspace-read-repository";
import type { ProductPlanningContextRepository } from "@/data/repositories/planning-context-repository";
import {
  buildActivityHistory,
  buildCalendarRange,
  buildHabits,
  buildOpenTasks,
  buildPlanningContext,
  buildProjects,
  buildToday,
  buildWeekSummary,
  buildWorkSessions,
  dateInTimeZone,
  weekStartFor,
} from "@/domain/personal-os-read-model";
import { readToolSchemas, type ReadToolName } from "@/mcp/tools";

export class PersonalOsReadService {
  constructor(private readonly repository: WorkspaceReadRepository,private readonly productRepository?:ProductPlanningContextRepository) {}

  async execute(toolName: ReadToolName, rawInput: unknown) {
    readToolSchemas[toolName].parse(rawInput);
    const state = await this.repository.load({ activityLimit: 500, sessionLimit: 250, habitHistoryDays: 366 });
    const today = dateInTimeZone(new Date(), state.profile.timezone);

    switch (toolName) {
      case "get_planning_context": {
        const input = readToolSchemas.get_planning_context.parse(rawInput);
        const core=buildPlanningContext(state, input.date ?? today);
        if(!this.productRepository)return core;
        const{business,learning,system}=await this.productRepository.loadProducts();
        return{...core,
          work:{active_clients:business.summary.activeClients,open_deliverables:business.summary.openDeliverables,outstanding_amount:business.summary.outstanding,net_cash_flow:business.summary.netCashFlow,weighted_pipeline:business.summary.weightedPipeline,due_deliverables:business.deliverables.filter((item)=>item.status!=="completed").slice(0,10),unpaid_invoices:business.invoices.filter((item)=>!['paid','cancelled'].includes(item.status)).slice(0,10)},
          growth:{average_mastery:learning.growthSummary.averageMastery,revisions_due:learning.growthSummary.revisionsDue,learning_minutes:learning.growthSummary.learningMinutes,dsa:learning.dsaSummary,weak_topics:learning.topics.filter((item)=>item.weak).slice(0,10)},
          academics:{low_attendance:learning.academicSummary.lowAttendance,assignments_due:learning.assignments.filter((item)=>!['submitted','graded'].includes(item.status)).slice(0,10),upcoming_exams:learning.exams.slice(0,10)},
          goals:{average_progress:system.summary.averageGoalProgress,active:system.goals.filter((item)=>item.status==="active").slice(0,20)},
          notifications:{unread:system.summary.unreadNotifications,items:system.notifications.filter((item)=>!item.readAt).slice(0,10)},
          integrations:system.integrations.map((item)=>({connector:item.connector,status:item.status,last_synced_at:item.lastSyncedAt,message:item.statusMessage})),
        };
      }
      case "get_today": {
        const input = readToolSchemas.get_today.parse(rawInput);
        return buildToday(state, input.date ?? today);
      }
      case "get_calendar_range": {
        const input = readToolSchemas.get_calendar_range.parse(rawInput);
        return buildCalendarRange(state, input.start, input.end);
      }
      case "get_open_tasks": {
        const input = readToolSchemas.get_open_tasks.parse(rawInput);
        return buildOpenTasks(state, {
          priority: input.priority,
          projectId: input.project_id,
          dueBefore: input.due_before,
          includeBlocked: input.include_blocked,
          limit: input.limit,
        });
      }
      case "get_projects": {
        const input = readToolSchemas.get_projects.parse(rawInput);
        return buildProjects(state, input.status);
      }
      case "get_work_sessions": {
        const input = readToolSchemas.get_work_sessions.parse(rawInput);
        return buildWorkSessions(state, input);
      }
      case "get_habits": {
        const input = readToolSchemas.get_habits.parse(rawInput);
        return buildHabits(state, input.date ?? today, input.days);
      }
      case "get_activity_history": {
        const input = readToolSchemas.get_activity_history.parse(rawInput);
        return buildActivityHistory(state, input);
      }
      case "get_week_summary": {
        const input = readToolSchemas.get_week_summary.parse(rawInput);
        return buildWeekSummary(state, input.week_start ?? weekStartFor(today));
      }
    }
  }
}
