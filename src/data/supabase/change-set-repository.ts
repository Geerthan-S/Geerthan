import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateChangeSetInput } from "@/features/changesets/schema";

export class SupabaseChangeSetRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async list() {
    const { data, error } = await this.client
      .from("change_sets")
      .select("*, change_operations(*)")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async createDraft(input: CreateChangeSetInput) {
    const { data: changeSet, error } = await this.client
      .from("change_sets")
      .insert({
        user_id: this.userId,
        title: input.title,
        rationale: input.rationale,
        status: "draft",
        created_by: input.createdBy,
        source: input.source,
        idempotency_key: input.idempotencyKey,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: operationError } = await this.client.from("change_operations").insert(
      input.operations.map((operation, sequence) => ({
        change_set_id: changeSet.id,
        sequence,
        entity_type: operation.entity,
        action: operation.action,
        entity_id: operation.entityId,
        expected_version: operation.expectedVersion,
        summary: operation.summary,
        before_state: operation.before,
        after_state: operation.after,
      })),
    );
    if (operationError) throw operationError;
    return changeSet;
  }

  async commit(id: string) {
    const { data, error } = await this.client.rpc("commit_task_change_set", {
      target_change_set: id,
    });
    if (error) throw error;
    return data;
  }
}
