"use client";

import { Banknote, BriefcaseBusiness, CircleDollarSign, FileText, HeartPulse, Plus, ReceiptText, Target, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BusinessSnapshot } from "@/domain/business-models";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

type WorkTab = "overview" | "clients" | "finance" | "pipeline";
const money = (value: number, currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)) : "No date";

export function WorkView() {
  const [data, setData] = useState<BusinessSnapshot | null>(null);
  const [tab, setTab] = useState<WorkTab>("overview");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/product/business", { cache: "no-store" });
    if (!response.ok) throw new Error("Business workspace is unavailable until its migration is applied.");
    const body = await response.json() as { data: BusinessSnapshot };
    return body.data;
  }, []);

  useEffect(() => {
    let active = true;
    load().then((snapshot) => { if (active) setData(snapshot); }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [load]);

  async function act(action: string, payload: Record<string, unknown>, expectedVersion?: number) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/product/business", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, ...(expectedVersion ? { expected_version: expectedVersion } : {}), idempotency_key: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error("The business action could not be saved.");
      setData(await load());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The action failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Work command" title="Run the work, not the admin." description="Clients, delivery, pipeline and money in one calm operating view." />
      {error ? <div className="workspace-error">{error}</div> : null}
      <div className="work-summary-grid">
        <GlassPanel><UsersRound size={18}/><span>Active clients</span><strong>{data?.summary.activeClients ?? "—"}</strong><small>{data?.clients.length ?? 0} total relationships</small></GlassPanel>
        <GlassPanel><BriefcaseBusiness size={18}/><span>Open delivery</span><strong>{data?.summary.openDeliverables ?? "—"}</strong><small>milestones in motion</small></GlassPanel>
        <GlassPanel><CircleDollarSign size={18}/><span>Outstanding</span><strong>{data ? money(data.summary.outstanding) : "—"}</strong><small>{data ? money(data.summary.collected) : "—"} collected</small></GlassPanel>
        <GlassPanel><Target size={18}/><span>Weighted pipeline</span><strong>{data ? money(data.summary.weightedPipeline) : "—"}</strong><small>{data?.leads.filter((lead) => !["won","lost"].includes(lead.status)).length ?? 0} active leads</small></GlassPanel>
      </div>
      <div className="work-tabs">{(["overview","clients","finance","pipeline"] as WorkTab[]).map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
      {!data ? <GlassPanel className="module-loading">Loading the Supabase workspace…</GlassPanel> : null}
      {data && tab === "overview" ? <WorkOverview data={data} /> : null}
      {data && tab === "clients" ? <ClientsPanel data={data} act={act} saving={saving} /> : null}
      {data && tab === "finance" ? <FinancePanel data={data} act={act} saving={saving} /> : null}
      {data && tab === "pipeline" ? <PipelinePanel data={data} act={act} saving={saving} /> : null}
    </div>
  );
}

function WorkOverview({ data }: { data: BusinessSnapshot }) {
  return <div className="work-hub-grid">
    <GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Delivery</span><h2>Milestones moving now</h2></div><HeartPulse size={18}/></div><div className="business-list">{data.deliverables.map((item) => <div className="business-row" key={item.id}><span className={`record-dot health-${item.status === "blocked" ? "blocked" : "on_track"}`}/><div><strong>{item.title}</strong><small>{item.status.replaceAll("_", " ")} · due {dateLabel(item.dueAt)}</small></div><div className="business-progress"><i style={{width:`${item.progress}%`}}/><span>{item.progress}%</span></div></div>)}</div></GlassPanel>
    <GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Collections</span><h2>Invoices needing attention</h2></div><ReceiptText size={18}/></div><div className="business-list">{data.invoices.filter((invoice) => invoice.status !== "paid").map((invoice) => { const paid = data.payments.filter((payment) => payment.invoiceId === invoice.id).reduce((sum,payment)=>sum+payment.amount,0); return <div className="business-row" key={invoice.id}><FileText size={16}/><div><strong>{invoice.invoiceNumber}</strong><small>{invoice.status} · due {dateLabel(invoice.dueOn)}</small></div><span className="business-amount">{money(invoice.total-paid, invoice.currency)}</span></div>; })}</div></GlassPanel>
    <GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Operating rhythm</span><h2>Recurring operations</h2></div><BriefcaseBusiness size={18}/></div><div className="business-list">{data.recurringOperations.map((item)=><div className="business-row" key={item.id}><span className="record-dot"/><div><strong>{item.title}</strong><small>{item.cadence} · next {dateLabel(item.nextDue)}</small></div></div>)}</div></GlassPanel>
    <GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Business goals</span><h2>Targets that shape the week</h2></div><Target size={18}/></div><div className="business-list">{data.goals.map((goal)=><div className="business-row" key={goal.id}><div><strong>{goal.title}</strong><small>{money(goal.currentValue)} of {money(goal.targetValue)} · {dateLabel(goal.deadline)}</small></div><div className="business-progress"><i style={{width:`${Math.min(100,goal.currentValue/Math.max(1,goal.targetValue)*100)}%`}}/></div></div>)}</div></GlassPanel>
  </div>;
}

function ClientsPanel({ data, act, saving }: { data: BusinessSnapshot; act: (action:string,payload:Record<string,unknown>)=>Promise<void>; saving:boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await act("create_client", { name: form.get("name"), company: form.get("company") ?? "", email: form.get("email") ?? "", phone: "", status: "lead", health: "on_track", next_action: "Schedule introduction", next_action_at: null }); event.currentTarget.reset(); }
  return <div className="business-split"><GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Directory</span><h2>Client relationships</h2></div><UsersRound size={18}/></div><div className="client-card-grid">{data.clients.map((client)=><div className="client-mini-card" key={client.id}><div><span className={`record-dot health-${client.health}`}/><strong>{client.company || client.name}</strong></div><p>{client.name} · {client.status}</p><small>{client.nextAction || "No next action"}</small><span>{data.contacts.filter((contact)=>contact.clientId===client.id).length} contacts · {data.notes.filter((note)=>note.clientId===client.id).length} notes</span></div>)}</div></GlassPanel><GlassPanel className="compact-create-panel"><span className="eyebrow">New relationship</span><h2>Add a client</h2><form onSubmit={submit}><input className="glass-input" name="name" required placeholder="Contact name"/><input className="glass-input" name="company" placeholder="Company"/><input className="glass-input" name="email" type="email" placeholder="Email"/><Button disabled={saving}><Plus size={14}/>Add client</Button></form></GlassPanel></div>;
}

function FinancePanel({ data, act, saving }: { data: BusinessSnapshot; act: (action:string,payload:Record<string,unknown>)=>Promise<void>; saving:boolean }) {
  async function transaction(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await act("add_transaction", { entry_type: form.get("entry_type"), entry_date: new Date().toISOString().slice(0,10), amount: Number(form.get("amount")), currency:"INR", category: form.get("category"), description: form.get("description") ?? "", client_id:null, project_id:null, invoice_id:null, recurring:false }); event.currentTarget.reset(); }
  async function payment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await act("record_payment", { invoice_id: form.get("invoice_id"), amount: Number(form.get("amount")), paid_at:new Date().toISOString(), method:"bank_transfer", reference:form.get("reference") ?? "", note:"" }); event.currentTarget.reset(); }
  return <div className="work-hub-grid"><GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Cash flow</span><h2>{money(data.summary.netCashFlow)} net</h2></div><Banknote size={18}/></div><div className="finance-ledger">{data.transactions.map((entry)=><div key={entry.id}><span className={entry.entryType}>{entry.entryType === "income" ? "+" : "−"}{money(entry.amount,entry.currency)}</span><div><strong>{entry.category}</strong><small>{entry.description || dateLabel(entry.entryDate)}</small></div></div>)}</div></GlassPanel><GlassPanel className="compact-create-panel"><span className="eyebrow">Record money</span><h2>Income or expense</h2><form onSubmit={transaction}><select className="glass-input" name="entry_type"><option value="expense">Expense</option><option value="income">Income</option></select><input className="glass-input" name="amount" type="number" min="1" required placeholder="Amount"/><input className="glass-input" name="category" required placeholder="Category"/><input className="glass-input" name="description" placeholder="Description"/><Button disabled={saving}>Save transaction</Button></form></GlassPanel><GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Invoices</span><h2>Payment tracking</h2></div><ReceiptText size={18}/></div><div className="business-list">{data.invoices.map((invoice)=><div className="business-row" key={invoice.id}><FileText size={15}/><div><strong>{invoice.invoiceNumber}</strong><small>{invoice.status} · {dateLabel(invoice.dueOn)}</small></div><span className="business-amount">{money(invoice.total,invoice.currency)}</span></div>)}</div></GlassPanel><GlassPanel className="compact-create-panel"><span className="eyebrow">Partial or final</span><h2>Record payment</h2><form onSubmit={payment}><select className="glass-input" name="invoice_id" required>{data.invoices.filter((invoice)=>invoice.status!=="paid").map((invoice)=><option value={invoice.id} key={invoice.id}>{invoice.invoiceNumber}</option>)}</select><input className="glass-input" name="amount" type="number" min="1" required placeholder="Amount received"/><input className="glass-input" name="reference" placeholder="Reference"/><Button disabled={saving}>Record payment</Button></form></GlassPanel></div>;
}

function PipelinePanel({ data, act, saving }: { data: BusinessSnapshot; act:(action:string,payload:Record<string,unknown>)=>Promise<void>; saving:boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form=new FormData(event.currentTarget); await act("create_lead", { name:form.get("name"), company:form.get("company") ?? "", email:"", status:"new", estimated_value:Number(form.get("value")), probability:10, next_action:"Qualify opportunity", next_action_at:null }); event.currentTarget.reset(); }
  return <div className="business-split"><GlassPanel className="work-hub-panel"><div className="module-heading"><div><span className="eyebrow">Lead pipeline</span><h2>Opportunities by stage</h2></div><Target size={18}/></div><div className="pipeline-columns">{["new","contacted","qualified","proposal"].map((stage)=><div key={stage}><span>{stage}</span>{data.leads.filter((lead)=>lead.status===stage).map((lead)=><article key={lead.id}><strong>{lead.company || lead.name}</strong><small>{money(lead.estimatedValue)} · {lead.probability}%</small><p>{lead.nextAction}</p></article>)}</div>)}</div></GlassPanel><GlassPanel className="compact-create-panel"><span className="eyebrow">Opportunity</span><h2>Add a lead</h2><form onSubmit={submit}><input className="glass-input" name="name" required placeholder="Contact name"/><input className="glass-input" name="company" placeholder="Company"/><input className="glass-input" name="value" type="number" min="0" required placeholder="Estimated value"/><Button disabled={saving}><Plus size={14}/>Add lead</Button></form></GlassPanel></div>;
}
