import type { ConnectorHealth, ConnectorId, ExternalRecord, IntegrationAdapter } from "@/integrations/contracts";

export const connectorDefinitions = [
  {id:"google_calendar",name:"Google Calendar",boundary:"Calendar events and approved time-block writes",capabilities:["read","write"]},
  {id:"microsoft_teams",name:"Microsoft Teams",boundary:"Assignments, deadlines and class context",capabilities:["read"]},
  {id:"vtop",name:"VTOP MCP",boundary:"Attendance, timetable and academic records",capabilities:["read"]},
  {id:"lms",name:"LMS",boundary:"Coursework, submissions and exam dates",capabilities:["read"]},
  {id:"github",name:"GitHub",boundary:"Contribution evidence and project activity",capabilities:["read"]},
  {id:"gmail",name:"Gmail",boundary:"Actionable mail metadata; no message sending",capabilities:["read"]},
  {id:"leetcode",name:"LeetCode",boundary:"Solved-problem evidence and topic mapping",capabilities:["read"]},
] as const satisfies readonly {id:ConnectorId;name:string;boundary:string;capabilities:readonly("read"|"write")[]}[];

export class NotConfiguredIntegrationAdapter implements IntegrationAdapter {
  readonly capabilities:readonly("read"|"write")[];
  constructor(readonly id:ConnectorId,capabilities:readonly("read"|"write")[]){this.capabilities=capabilities;}
  async healthCheck():Promise<ConnectorHealth>{return{connector:this.id,status:"not_configured",checkedAt:new Date().toISOString(),message:"OAuth or connector credentials are not configured."};}
  async pull():Promise<{records:ExternalRecord[];nextCursor?:string}>{throw new Error(`${this.id}_not_configured`);}
}

export const integrationAdapters=new Map(connectorDefinitions.map((definition)=>[definition.id,new NotConfiguredIntegrationAdapter(definition.id,definition.capabilities)]));
