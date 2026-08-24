"use client";

import { Braces, CheckCircle2, Database, Play, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/features/workspace/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { GlassPanel } from "@/shared/components/ui/glass-panel";

interface ToolManifestItem {
  name: string;
  description: string;
  permission: "state:read";
  endpoint: string;
  method: "POST";
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
}

interface ToolManifestResponse {
  mode: "read-only";
  source: "supabase";
  tools: ToolManifestItem[];
}

export function McpDiagnosticsView() {
  const [manifest, setManifest] = useState<ToolManifestResponse | null>(null);
  const [selected, setSelected] = useState("");
  const [input, setInput] = useState("{}");
  const [output, setOutput] = useState("Select a tool and run it to inspect the exact authenticated response.");
  const [running, setRunning] = useState(false);
  const [resultMeta, setResultMeta] = useState<{ status: number; duration: number; bytes: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/mcp/tools", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load MCP tools.");
        return (await response.json()) as ToolManifestResponse;
      })
      .then((data) => {
        if (!active) return;
        setManifest(data);
        const first = data.tools[0];
        if (first) {
          setSelected(first.name);
          setInput(JSON.stringify(first.exampleInput, null, 2));
        }
      })
      .catch((error: Error) => active && setOutput(error.message));
    return () => {
      active = false;
    };
  }, []);

  const selectedTool = useMemo(() => manifest?.tools.find((tool) => tool.name === selected), [manifest, selected]);

  function chooseTool(tool: ToolManifestItem) {
    setSelected(tool.name);
    setInput(JSON.stringify(tool.exampleInput, null, 2));
    setResultMeta(null);
  }

  async function runTool() {
    if (!selectedTool) return;
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
      const response = await fetch(selectedTool.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const text = await response.text();
      const duration = Math.round(performance.now() - startedAt);
      setResultMeta({ status: response.status, duration, bytes: new TextEncoder().encode(text).byteLength });
      try {
        setOutput(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setOutput(text);
      }
    } catch {
      setOutput(JSON.stringify({ error: "The read request could not be completed." }, null, 2));
      setResultMeta(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Developer surface"
        title="MCP read diagnostics"
        description="Inspect the exact compact JSON returned from the authenticated, user-scoped Supabase read layer. No tool on this page can mutate data."
      />

      <div className="mcp-assurance-strip">
        <GlassPanel><ShieldCheck size={18} /><div><strong>Authenticated</strong><span>Current user scope only</span></div></GlassPanel>
        <GlassPanel><Database size={18} /><div><strong>Supabase source</strong><span>No UI state reads</span></div></GlassPanel>
        <GlassPanel><CheckCircle2 size={18} /><div><strong>Read only</strong><span>Nine bounded tools</span></div></GlassPanel>
      </div>

      <div className="mcp-diagnostics-layout">
        <GlassPanel className="mcp-tool-list">
          <div className="mcp-panel-heading"><span className="eyebrow">Available tools</span><strong>{manifest?.tools.length ?? 0}</strong></div>
          {manifest?.tools.map((tool) => (
            <button key={tool.name} className={selected === tool.name ? "is-active" : ""} onClick={() => chooseTool(tool)}>
              <Braces size={15} />
              <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
              <i>read</i>
            </button>
          )) ?? <p className="muted-copy">Loading authenticated tools…</p>}
        </GlassPanel>

        <div className="mcp-console-stack">
          <GlassPanel className="mcp-input-panel">
            <div className="mcp-panel-heading">
              <div><span className="eyebrow">Tool input</span><strong>{selectedTool?.name ?? "Loading"}</strong></div>
              <Button onClick={runTool} disabled={!selectedTool || running}><Play size={14} />{running ? "Reading…" : "Run read"}</Button>
            </div>
            <p>{selectedTool?.description}</p>
            <textarea className="glass-input mcp-json-input" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} aria-label="Tool input JSON" />
          </GlassPanel>

          <GlassPanel className="mcp-output-panel">
            <div className="mcp-panel-heading">
              <span className="eyebrow">Exact response</span>
              {resultMeta ? <small className={resultMeta.status < 400 ? "is-success" : "is-error"}>{resultMeta.status} · {resultMeta.duration} ms · {resultMeta.bytes} bytes</small> : null}
            </div>
            <pre>{output}</pre>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
