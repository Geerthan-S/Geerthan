import type { Metadata } from "next";
import { TasksView } from "@/features/tasks/components/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return <TasksView />;
}
