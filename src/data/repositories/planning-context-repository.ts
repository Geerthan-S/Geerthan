import type { BusinessSnapshot } from "@/domain/business-models";
import type { LearningSnapshot } from "@/domain/learning-models";
import type { SystemSnapshot } from "@/domain/system-models";

export interface ProductPlanningContextRepository {
  loadProducts():Promise<{business:BusinessSnapshot;learning:LearningSnapshot;system:SystemSnapshot}>;
}
