export default function WorkspaceLoading() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="route-skeleton route-skeleton-title" />
      <div className="route-skeleton route-skeleton-panel" />
      <div className="route-skeleton route-skeleton-panel" />
    </div>
  );
}
