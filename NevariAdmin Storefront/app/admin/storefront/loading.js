export default function AdminStorefrontLoading() {
  return <div className="desktop-dashboard-page role-shell-exact">
    <section className="desktop-dashboard-shell">
      <div className="desktop-dashboard-screen">
        <div className="screen-scroll">
          <section className="page-banner panel skeleton-panel">
            <div className="skeleton skeleton-line skeleton-line-xs" />
            <div className="skeleton skeleton-line skeleton-line-lg" />
            <div className="skeleton skeleton-line skeleton-line-md" />
          </section>
          <section className="panel table-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <div className="skeleton skeleton-line skeleton-line-xs" />
                <div className="skeleton skeleton-line skeleton-line-lg" />
              </div>
            </div>
            <div className="skeleton skeleton-block" />
          </section>
        </div>
      </div>
    </section>
  </div>;
}
