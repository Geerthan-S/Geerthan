"use client";

import { LocalWorkspaceRepository } from "@/data/repositories/local-workspace-repository";
import type { WorkspaceRepository } from "@/data/repositories/workspace-repository";
import { createSupabaseBrowserClient } from "@/data/supabase/client";
import { SupabaseWorkspaceRepository } from "@/data/supabase/supabase-workspace-repository";

export function createWorkspaceRepository(): WorkspaceRepository {
  const supabase = createSupabaseBrowserClient();
  return supabase
    ? new SupabaseWorkspaceRepository(supabase)
    : new LocalWorkspaceRepository();
}
