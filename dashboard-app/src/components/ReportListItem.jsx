import { format } from 'date-fns'

function formatDate(ts) {
  if (!ts) return ''
  try { return format(new Date(ts), 'MMM dd, yyyy') }
  catch { return ts }
}

export default function ReportListItem({ report, onClick }) {
  const sourceClass = report.data_source === 'llm' ? 'badge-llm' : 'badge-csv'
  return (
    <div className="report-item" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div>
        <p className="report-title">{report.crop_name} — {report.sub_stage_name}</p>
        <p className="report-meta">{report.main_stage} · Day {report.start_day}–{report.end_day}</p>
      </div>
      <div className="report-date">{formatDate(report.updated_at)}</div>
      <span className={`badge ${sourceClass}`}>{report.data_source?.toUpperCase()}</span>
    </div>
  )
}
