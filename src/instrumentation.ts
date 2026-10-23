import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("@/observability/report-error");
  await reportError({
    source: "server",
    message: error instanceof Error ? error.message : String(error),
    digest:
      typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });
};
