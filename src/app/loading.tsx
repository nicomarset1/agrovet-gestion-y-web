export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-bar" aria-hidden="true" />
      <div className="container route-loading-body">
        <span className="brand-mark route-loading-mark" aria-hidden="true" />
        <span className="route-loading-text">Cargando…</span>
      </div>
    </div>
  );
}
