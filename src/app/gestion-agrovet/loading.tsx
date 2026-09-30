// Esqueleto del panel mientras carga: misma grilla y proporciones que el dashboard real
// (período, ventas + stock + pedidos, y las tarjetas de abajo) para que no salte el layout.
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
              <span className="admin-skeleton-line" style={{ width: 280 }} />
            </div>
            <div className="admin-dashboard-bar">
              <span className="admin-skeleton-line period" />
              <span className="admin-skeleton-line short" style={{ width: 240 }} />
            </div>
            <div className="admin-dash-top">
              {["admin-dash-sales", "", ""].map((extra, index) => (
                <div className={`card admin-dash-card admin-skeleton-card ${extra}`} key={index}>
                  <span className="admin-skeleton-line short" style={{ width: "45%" }} />
                  <span className="admin-skeleton-line value" />
                  <span className="admin-skeleton-line short" style={{ width: "70%" }} />
                </div>
              ))}
            </div>
            <div className="admin-dash-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="card admin-panel admin-dash-card admin-skeleton-stack" key={index}>
                  <span className="admin-skeleton-line" style={{ width: "40%" }} />
                  <span className="admin-skeleton-line short" style={{ width: "60%" }} />
                  {Array.from({ length: 4 }, (_, row) => (
                    <span className="admin-skeleton-line row" key={row} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
