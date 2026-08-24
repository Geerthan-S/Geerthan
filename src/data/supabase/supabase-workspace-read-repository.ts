import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { WorkspaceReadRepository } from "@/data/repositories/workspace-read-repository";
import { readWorkspaceState, type WorkspaceReadOptions } from "@/data/supabase/read-workspace-state";

export class SupabaseWorkspaceReadRepository implements WorkspaceReadRepository {
  readonly userId: string;

  constructor(
    private readonly client: SupabaseClient,
    private readonly user: Pick<User, "id" | "email">,
  ) {
    this.userId = user.id;
  }

  load(options?: WorkspaceReadOptions) {
    return readWorkspaceState(this.client, this.user, options);
  }
}
