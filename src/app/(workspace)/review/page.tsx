import type { Metadata } from "next";
import { WeeklyReviewView } from "@/features/review/components/weekly-review-view";

export const metadata: Metadata = { title: "Weekly review" };

export default function WeeklyReviewPage() {
  return <WeeklyReviewView />;
}
