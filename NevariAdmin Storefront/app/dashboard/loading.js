export default function DashboardLoading() {
  return <div className="desktop-dashboard-page role-shell-exact">
    <section className="desktop-dashboard-shell">
      <div className="desktop-dashboard-screen">
        <div className="screen-scroll">
          <div className="customer-dashboard-stack">
            <section className="customer-list-shell skeleton-panel">
              <div className="customer-panel-head">
                <div>
                  <div className="skeleton skeleton-line skeleton-line-xs" />
                  <div className="skeleton skeleton-line skeleton-line-lg" />
                </div>
              </div>
              <div className="category-row">
                {Array.from({ length: 4 }, (_, index) => <div className="category-card skeleton-panel" key={index}>
                  <div className="skeleton skeleton-line skeleton-line-md skeleton-line-tall" />
                  <div className="skeleton skeleton-line skeleton-line-sm" />
                </div>)}
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  </div>;
}
