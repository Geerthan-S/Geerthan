export interface ClientRecord {
  id: string; version: number; name: string; company: string; email: string; phone: string;
  status: "lead" | "active" | "paused" | "former"; health: "on_track" | "at_risk" | "blocked";
  nextAction: string; nextActionAt: string | null;
}

export interface ClientContactRecord { id: string; clientId: string; name: string; role: string; email: string; phone: string; primary: boolean; }
export interface ClientNoteRecord { id: string; clientId: string; note: string; createdAt: string; }
export interface DeliverableRecord { id: string; clientId: string | null; projectId: string | null; title: string; status: string; progress: number; dueAt: string | null; version: number; }
export interface ProposalRecord { id: string; clientId: string | null; projectId: string | null; title: string; status: string; amount: number; currency: string; validUntil: string | null; version: number; }
export interface InvoiceRecord { id: string; clientId: string | null; projectId: string | null; invoiceNumber: string; status: string; issuedOn: string; dueOn: string | null; subtotal: number; tax: number; total: number; currency: string; version: number; }
export interface PaymentRecord { id: string; invoiceId: string; amount: number; paidAt: string; method: string; reference: string; note: string; }
export interface FinanceRecord { id: string; entryType: "income" | "expense"; entryDate: string; amount: number; currency: string; category: string; description: string; clientId: string | null; projectId: string | null; invoiceId: string | null; recurring: boolean; }
export interface LeadRecord { id: string; version: number; name: string; company: string; email: string; status: string; estimatedValue: number; probability: number; nextAction: string; nextActionAt: string | null; }
export interface GoalRecord { id: string; version: number; title: string; targetValue: number; currentValue: number; unit: string; deadline: string | null; status: string; }
export interface RecurringOperationRecord { id: string; version: number; title: string; cadence: string; nextDue: string; active: boolean; }
export interface FinancialGoalRecord { id: string; version: number; title: string; targetAmount: number; currentAmount: number; currency: string; deadline: string | null; }

export interface BusinessSnapshot {
  clients: ClientRecord[];
  contacts: ClientContactRecord[];
  notes: ClientNoteRecord[];
  deliverables: DeliverableRecord[];
  proposals: ProposalRecord[];
  invoices: InvoiceRecord[];
  payments: PaymentRecord[];
  transactions: FinanceRecord[];
  leads: LeadRecord[];
  goals: GoalRecord[];
  recurringOperations: RecurringOperationRecord[];
  financialGoals: FinancialGoalRecord[];
  summary: { activeClients: number; openDeliverables: number; invoiced: number; collected: number; outstanding: number; income: number; expenses: number; netCashFlow: number; weightedPipeline: number; };
}
