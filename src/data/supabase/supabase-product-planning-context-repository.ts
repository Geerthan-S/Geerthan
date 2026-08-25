import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductPlanningContextRepository } from "@/data/repositories/planning-context-repository";
import { SupabaseBusinessRepository } from "@/data/supabase/supabase-business-repository";
import { SupabaseLearningRepository } from "@/data/supabase/supabase-learning-repository";
import { SupabaseSystemRepository } from "@/data/supabase/supabase-system-repository";

export class SupabaseProductPlanningContextRepository implements ProductPlanningContextRepository {
  constructor(private readonly client:SupabaseClient,private readonly userId:string){}
  async loadProducts(){const[business,learning,system]=await Promise.all([new SupabaseBusinessRepository(this.client,this.userId).load(),new SupabaseLearningRepository(this.client,this.userId).load(),new SupabaseSystemRepository(this.client,this.userId).load()]);return{business,learning,system};}
}
