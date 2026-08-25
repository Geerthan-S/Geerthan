"use client";

import { Braces, CheckCircle2, Database, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

interface ToolManifestItem {
  name: string;
  description: string;
  permission: string;
  endpoint: string;
  method: "POST";
  inputSchema: Record<string, unknown>;
  exampleInput?: Record<string, unknown>;
}

interface ToolManifestResponse {
  tools: ToolManifestItem[];
}

type Surface = "reads" | "actions";
const placeholderId = "00000000-0000-4000-8000-000000000000";

function actionExample(name: string) {
  const key = `diagnostics.${name}.v1`;
  const now = new Date();
  const later = new Date(now.getTime() + 45 * 60_000);
  const date = now.toISOString().slice(0, 10);
  switch (name) {
    case "create_task": return { title: "Captured from MCP diagnostics", priority: "medium", project_id: null, due_at: null, estimate_minutes: 30, tags: ["diagnostics"], idempotency_key: key };
    case "update_task": return { task_id: placeholderId, expected_version: 1, patch: { priority: "high" }, idempotency_key: key };
    case "complete_task": return { task_id: placeholderId, expected_version: 1, idempotency_key: key };
    case "reschedule_task": return { task_id: placeholderId, expected_version: 1, starts_at: now.toISOString(), ends_at: later.toISOString(), idempotency_key: key };
    case "start_work_session": return { task_id: placeholderId, expected_task_version: 1, idempotency_key: key };
    case "end_work_session": return { session_id: placeholderId, expected_version: 1, outcome: "", idempotency_key: key };
    case "log_habit": return { habit_id: placeholderId, date, value: 1, note: "", expected_log_version: null, idempotency_key: key };
    case "create_time_block": return { title: "Diagnostics focus block", kind: "focus", starts_at: now.toISOString(), ends_at: later.toISOString(), notes: "", idempotency_key: key };
    case "update_time_block": return { time_block_id: placeholderId, expected_version: 1, patch: { title: "Updated focus block" }, idempotency_key: key };
    case "draft_day_plan": return { date, include_overdue: true, idempotency_key: key };
    default: return { change_set_id: placeholderId, idempotency_key: key };
  }
}

export function McpDiagnosticsView() {
  const [readTools, setReadTools] = useState<ToolManifestItem[]>([]);
  const [actionTools, setActionTools] = useState<ToolManifestItem[]>([]);
  const [surface, setSurface] = useState<Surface>("reads");
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("{}");
  const [output, setOutput] = useState("Select a tool and run it to inspect the exact authenticated response.");
  const [running, setRunning] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resultMeta, setResultMeta] = useState<{ status: number; duration: number; bytes: number } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/mcp/tools", { cache: "no-store" }),
      fetch("/api/mcp/actions", { cache: "no-store" }),
    ])
      .then(async ([reads, actions]) => {
        if (!reads.ok || !actions.ok) throw new Error("Unable to load authenticated MCP contracts.");
        return Promise.all([reads.json() as Promise<ToolManifestResponse>, actions.json() as Promise<ToolManifestResponse>]);
      })
      .then(([reads, actions]) => {
        if (!active) return;
        setReadTools(reads.tools);
        setActionTools(actions.tools);
        const first = reads.tools[0];
        if (first) {
          setSurface("reads");
          setSelected(first.name);
          setInput(JSON.stringify(first.exampleInput ?? {}, null, 2));
          setResultMeta(null);
          setConfirmed(false);
        }
      })
      .catch((error: Error) => active && setOutput(error.message));
    return () => { active = false; };
  }, []);

  const tools = surface === "reads" ? readTools : actionTools;
  const selectedTool = useMemo(() => tools.find((tool) => tool.name === selected), [tools, selected]);
  const isWrite = surface === "actions";

  function chooseTool(tool: ToolManifestItem, nextSurface = surface) {
    setSurface(nextSurface);
    setSelected(tool.name);
    setInput(JSON.stringify(nextSurface === "reads" ? (tool.exampleInput ?? {}) : actionExample(tool.name), null, 2));
    setResultMeta(null);
    setConfirmed(false);
  }

  function switchSurface(next: Surface) {
    const first = (next === "reads" ? readTools : actionTools)[0];
    if (first) chooseTool(first, next);
  }

  async function runTool() {
    if (!selectedTool || (isWrite && !confirmed)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      setOutput(JSON.stringify({ error: "Input must be valid JSON." }, null, 2));
      return;
    }
    setRunning(true);
    const startedAt = performance.now();
    try {
      const response = await fetch(selectedTool.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const text = await response.text();
      setResultMeta({ status: response.status, duration: Math.round(performance.now() - startedAt), bytes: new TextEncoder().encode(text).byteLength });
      try { setOutput(JSON.stringify(JSON.parse(text), null, 2)); } catch { setOutput(text); }
    } catch {
      setOutput(JSON.stringify({ error: "The authenticated tool request could not be completed." }, null, 2));
      setResultMeta(null);
    } finally {
      setRunning(false);
      setConfirmed(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Developer surface" title="MCP diagnostics" description="Inspect exact Supabase-backed read responses and explicitly test validated domain actions. No arbitrary database mutation is exposed." />
      <div className="mcp-assurance-strip">
        <GlassPanel><ShieldCheck size={18} /><div><strong>Authenticated</strong><span>Current user scope only</span></div></GlassPanel>
        <GlassPanel><Database size={18} /><div><strong>Supabase source</strong><span>No UI state reads</span></div></GlassPanel>
        <GlassPanel><CheckCircle2 size={18} /><div><strong>Bounded actions</strong><span>Idempotent + version checked</span></div></GlassPanel>
      </div>

      <div className="mcp-surface-tabs" role="tablist" aria-label="MCP diagnostic surface">
        <button className={surface === "reads" ? "is-active" : ""} onClick={() => switchSurface("reads")}>Read tools · {readTools.length}</button>
        <button className={surface === "actions" ? "is-active" : ""} onClick={() => switchSurface("actions")}>Domain actions · {actionTools.length}</button>
      </div>

      <div className="mcp-diagnostics-layout">
        <GlassPanel className="mcp-tool-list">
          <div className="mcp-panel-heading"><span className="eyebrow">Available {surface}</span><strong>{tools.length}</strong></div>
          {tools.map((tool) => (
            <button key={tool.name} className={selected === tool.name ? "is-active" : ""} onClick={() => chooseTool(tool)}>
              <Braces size={15} /><span><strong>{tool.name}</strong><small>{tool.description}</small></span><i>{isWrite ? "write" : "read"}</i>
            </button>
          ))}
        </GlassPanel>

        <div className="mcp-console-stack">
          <GlassPanel className="mcp-input-panel">
            <div className="mcp-panel-heading">
              <div><span className="eyebrow">Tool input</span><strong>{selectedTool?.name ?? "Loading"}</strong></div>
              <Button onClick={runTool} disabled={!selectedTool || running || (isWrite && !confirmed)}><Play size={14} />{running ? "Running…" : isWrite ? "Run action" : "Run read"}</Button>
            </div>
            <p>{selectedTool?.description}</p>
            <textarea className="glass-input mcp-json-input" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} aria-label="Tool input JSON" />
            {isWrite ? <label className="mcp-write-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand this calls a real, audited Supabase domain action.</span></label> : null}
          </GlassPanel>
          <GlassPanel className="mcp-output-panel">
            <div className="mcp-panel-heading"><span className="eyebrow">Exact response</span>{resultMeta ? <small className={resultMeta.status < 400 ? "is-success" : "is-error"}>{resultMeta.status} · {resultMeta.duration} ms · {resultMeta.bytes} bytes</small> : null}</div>
            <pre>{output}</pre>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
