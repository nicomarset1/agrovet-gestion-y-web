// Esqueleto del panel mientras carga: misma grilla que el panel real para que no salte el layout.
export default function AdminLoading() {
  return (
    <div className="admin-shell admin-skeleton" role="status" aria-live="polite">
      <span className="admin-skeleton-sr">Cargando panel…</span>
      <div className="container">
        <div className="admin-layout" aria-hidden="true">
          <aside aria-label="Panel de gestión" className="admin-sidebar card">
            <div className="admin-brand">
              <span className="admin-brand-mark" />
              <div className="admin-skeleton-stack">
                <span className="admin-skeleton-line" style={{ width: 150 }} />
                <span className="admin-skeleton-line short" style={{ width: 96 }} />
              </div>
            </div>
            <div className="admin-skeleton-nav">
              {Array.from({ length: 8 }, (_, index) => (
                <span className="admin-skeleton-line nav" key={index} />
              ))}
            </div>
          </aside>
          <div className="admin-main">
            <div className="admin-current-branch-banner">
              <span className="admin-skeleton-line short" style={{ width: 120 }} />
              <span className="admin-skeleton-line" style={{ width: 200 }} />
            </div>
            <div className="admin-skeleton-stack">
              <span className="admin-skeleton-line short" style={{ width: 110 }} />
              <span className="admin-skeleton-line title" />
              <span className="admin-skeleton-line" style={{ width: 240 }} />
            </div>
            <div className="admin-stat-grid">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="card admin-stat admin-skeleton-stack" key={index}>
                  <span className="admin-skeleton-line short" style={{ width: "55%" }} />
                  <span className="admin-skeleton-line value" />
                  <span className="admin-skeleton-line short" style={{ width: "75%" }} />
                </div>
              ))}
            </div>
            <div className="card admin-panel admin-skeleton-stack">
              <span className="admin-skeleton-line" style={{ width: "32%" }} />
              {Array.from({ length: 5 }, (_, index) => (
                <span className="admin-skeleton-line row" key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
