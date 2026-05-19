export default function DoctorDashboardLoading() {
  return <div className="desktop-dashboard-page role-shell-exact">
    <section className="desktop-dashboard-shell">
      <div className="desktop-dashboard-screen">
        <div className="screen-scroll">
          <section className="table-panel skeleton-panel">
            <div className="panel-header">
              <div>
                <div className="skeleton skeleton-line skeleton-line-xs" />
                <div className="skeleton skeleton-line skeleton-line-lg" />
              </div>
            </div>
            <div className="doctor-list">
              {Array.from({ length: 3 }, (_, index) => <div className="doctor-card skeleton-panel" key={index}>
                <div className="skeleton skeleton-line skeleton-line-md" />
                <div className="skeleton skeleton-line skeleton-line-sm" />
              </div>)}
            </div>
          </section>
        </div>
      </div>
    </section>
  </div>;
}
