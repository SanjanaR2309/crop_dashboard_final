export default function MetricCard({ label, value }) {
  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className="metric-value font-display">{value ?? '—'}</p>
    </div>
  )
}
