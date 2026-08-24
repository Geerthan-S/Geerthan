import type { ReactNode } from "react";
import { AppShell } from "@/features/workspace/components/app-shell";
import { WorkspaceProvider } from "@/features/workspace/workspace-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
