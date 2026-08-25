import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessSnapshot } from "@/domain/business-models";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => typeof row[key] === "string" ? row[key] as string : "";
const nullable = (row: Row, key: string) => typeof row[key] === "string" ? row[key] as string : null;
const number = (row: Row, key: string) => typeof row[key] === "number" ? row[key] as number : Number(row[key] ?? 0);

export class SupabaseBusinessRepository {
  constructor(private readonly client: SupabaseClient, private readonly userId: string) {}

  async load(): Promise<BusinessSnapshot> {
    const { error: initializeError } = await this.client.rpc("initialize_business_workspace");
    if (initializeError && initializeError.code !== "PGRST202") throw initializeError;
    const tables = ["clients", "client_contacts", "client_notes", "deliverables", "proposals", "invoices", "payments", "finance_transactions", "leads", "business_goals", "recurring_operations", "financial_goals"] as const;
    const results = await Promise.all(tables.map((table) => this.client.from(table).select("*").eq("user_id", this.userId).order("created_at", { ascending: false })));
    const failure = results.find((result) => result.error)?.error;
    if (failure) throw failure;
    const [clients, contacts, notes, deliverables, proposals, invoices, payments, transactions, leads, goals, operations, financialGoals] = results.map((result) => (result.data ?? []) as Row[][][number]);
    const invoiceRows = invoices ?? [];
    const paymentRows = payments ?? [];
    const transactionRows = transactions ?? [];
    const invoiced = invoiceRows.filter((row) => !["draft", "cancelled"].includes(text(row, "status"))).reduce((sum, row) => sum + number(row, "total"), 0);
    const collected = paymentRows.reduce((sum, row) => sum + number(row, "amount"), 0);
    const income = transactionRows.filter((row) => text(row, "entry_type") === "income").reduce((sum, row) => sum + number(row, "amount"), 0);
    const expenses = transactionRows.filter((row) => text(row, "entry_type") === "expense").reduce((sum, row) => sum + number(row, "amount"), 0);
    return {
      clients: (clients ?? []).map((row) => ({ id: text(row, "id"), version: number(row, "version"), name: text(row, "name"), company: text(row, "company"), email: text(row, "email"), phone: text(row, "phone"), status: text(row, "status") as BusinessSnapshot["clients"][number]["status"], health: text(row, "health") as BusinessSnapshot["clients"][number]["health"], nextAction: text(row, "next_action"), nextActionAt: nullable(row, "next_action_at") })),
      contacts: (contacts ?? []).map((row) => ({ id: text(row, "id"), clientId: text(row, "client_id"), name: text(row, "name"), role: text(row, "role"), email: text(row, "email"), phone: text(row, "phone"), primary: Boolean(row.is_primary) })),
      notes: (notes ?? []).map((row) => ({ id: text(row, "id"), clientId: text(row, "client_id"), note: text(row, "note"), createdAt: text(row, "created_at") })),
      deliverables: (deliverables ?? []).map((row) => ({ id: text(row, "id"), clientId: nullable(row, "client_id"), projectId: nullable(row, "project_id"), title: text(row, "title"), status: text(row, "status"), progress: number(row, "progress"), dueAt: nullable(row, "due_at"), version: number(row, "version") })),
      proposals: (proposals ?? []).map((row) => ({ id: text(row, "id"), clientId: nullable(row, "client_id"), projectId: nullable(row, "project_id"), title: text(row, "title"), status: text(row, "status"), amount: number(row, "amount"), currency: text(row, "currency"), validUntil: nullable(row, "valid_until"), version: number(row, "version") })),
      invoices: invoiceRows.map((row) => ({ id: text(row, "id"), clientId: nullable(row, "client_id"), projectId: nullable(row, "project_id"), invoiceNumber: text(row, "invoice_number"), status: text(row, "status"), issuedOn: text(row, "issued_on"), dueOn: nullable(row, "due_on"), subtotal: number(row, "subtotal"), tax: number(row, "tax"), total: number(row, "total"), currency: text(row, "currency"), version: number(row, "version") })),
      payments: paymentRows.map((row) => ({ id: text(row, "id"), invoiceId: text(row, "invoice_id"), amount: number(row, "amount"), paidAt: text(row, "paid_at"), method: text(row, "method"), reference: text(row, "reference"), note: text(row, "note") })),
      transactions: transactionRows.map((row) => ({ id: text(row, "id"), entryType: text(row, "entry_type") as "income" | "expense", entryDate: text(row, "entry_date"), amount: number(row, "amount"), currency: text(row, "currency"), category: text(row, "category"), description: text(row, "description"), clientId: nullable(row, "client_id"), projectId: nullable(row, "project_id"), invoiceId: nullable(row, "invoice_id"), recurring: Boolean(row.recurring) })),
      leads: (leads ?? []).map((row) => ({ id: text(row, "id"), version: number(row, "version"), name: text(row, "name"), company: text(row, "company"), email: text(row, "email"), status: text(row, "status"), estimatedValue: number(row, "estimated_value"), probability: number(row, "probability"), nextAction: text(row, "next_action"), nextActionAt: nullable(row, "next_action_at") })),
      goals: (goals ?? []).map((row) => ({ id: text(row, "id"), version: number(row, "version"), title: text(row, "title"), targetValue: number(row, "target_value"), currentValue: number(row, "current_value"), unit: text(row, "unit"), deadline: nullable(row, "deadline"), status: text(row, "status") })),
      recurringOperations: (operations ?? []).map((row) => ({ id: text(row, "id"), version: number(row, "version"), title: text(row, "title"), cadence: text(row, "cadence"), nextDue: text(row, "next_due"), active: Boolean(row.active) })),
      financialGoals: (financialGoals ?? []).map((row) => ({ id: text(row, "id"), version: number(row, "version"), title: text(row, "title"), targetAmount: number(row, "target_amount"), currentAmount: number(row, "current_amount"), currency: text(row, "currency"), deadline: nullable(row, "deadline") })),
      summary: { activeClients: (clients ?? []).filter((row) => text(row, "status") === "active").length, openDeliverables: (deliverables ?? []).filter((row) => text(row, "status") !== "completed").length, invoiced, collected, outstanding: Math.max(0, invoiced - collected), income, expenses, netCashFlow: income - expenses, weightedPipeline: (leads ?? []).filter((row) => !["won", "lost"].includes(text(row, "status"))).reduce((sum, row) => sum + number(row, "estimated_value") * number(row, "probability") / 100, 0) },
    };
  }

  async action(action: string, payload: Record<string, unknown>, expectedVersion: number | null, idempotencyKey: string) {
    const { data, error } = await this.client.rpc("product_business_action", { requested_action: action, payload, expected_version: expectedVersion, request_key: idempotencyKey });
    if (error) throw error;
    return data;
  }
}
