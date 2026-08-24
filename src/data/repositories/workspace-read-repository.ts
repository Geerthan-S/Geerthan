import type { WorkspaceState } from "@/domain/models";
import type { WorkspaceReadOptions } from "@/data/supabase/read-workspace-state";

export interface WorkspaceReadRepository {
  readonly userId: string;
  load(options?: WorkspaceReadOptions): Promise<WorkspaceState>;
}
