import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
  className?: string;
}) {
  return <span className={cn("status-pill", `status-${tone}`, className)}>{children}</span>;
}
