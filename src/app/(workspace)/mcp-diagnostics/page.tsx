import type { Metadata } from "next";
import { McpDiagnosticsView } from "@/features/mcp/components/mcp-diagnostics-view";

export const metadata: Metadata = { title: "MCP diagnostics" };

export default function McpDiagnosticsPage() {
  return <McpDiagnosticsView />;
}
