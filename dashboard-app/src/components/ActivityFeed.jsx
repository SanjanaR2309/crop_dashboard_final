import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

function timeAgo(ts) {
  if (!ts) return ''
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) }
  catch { return ts }
}

export default function ActivityFeed({ items = [] }) {
  const navigate = useNavigate()
  return (
    <div>
      <h3 className="section-heading">Recent Activity</h3>
      <div className="activity-feed">
        {items.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 14 }}>No recent activity.</div>
        )}
        {items.map((item) => (
          <div key={item.uid} className="feed-item" onClick={() => navigate(`/reports/${item.uid}`)}>
            <div style={{ flex: 1 }}>
              <p className="feed-title">{item.crop_name} — {item.sub_stage_name}</p>
              <p className="feed-subtitle">{item.main_stage} · Day {item.start_day}–{item.end_day} · Source: {item.data_source}</p>
            </div>
            <span className="feed-time">{timeAgo(item.updated_at)}</span>
          </div>
        ))}
      </div>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => navigate('/reports')}
        style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        View all records <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_right_alt</span>
      </button>
    </div>
  )
}
