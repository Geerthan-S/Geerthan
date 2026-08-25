import type { Metadata } from "next";
import { WorkView } from "@/features/work/components/work-view";

export const metadata: Metadata = { title: "Work" };

export default function WorkPage() { return <WorkView />; }
