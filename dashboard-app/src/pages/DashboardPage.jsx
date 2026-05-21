import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import MetricCard from '../components/MetricCard'
import ActivityFeed from '../components/ActivityFeed'
import VolumeChart from '../components/VolumeChart'
import { fetchStats } from '../api/cropApi'

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Navbar />
      <main style={{ padding: '64px 40px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 64 }}>
        {loading && (
          <div className="loading-page">
            <div className="spinner" />
            <span>Loading dashboard…</span>
          </div>
        )}
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 14 }}>Failed to load: {error}</div>
        )}
        {stats && (
          <>
            {/* Metric Cards — clickable, navigate to reports */}
            <section className="metric-grid">
              <div
                onClick={() => navigate('/reports')}
                style={{ cursor: 'pointer' }}
                title="View all reports"
              >
                <MetricCard label="Total Reports" value={stats.total_records?.toLocaleString()} />
              </div>
              <div
                onClick={() => navigate('/reports')}
                style={{ cursor: 'pointer' }}
                title="View all reports"
              >
                <MetricCard label="Crops" value={stats.unique_crops?.toLocaleString()} />
              </div>
              <div
                onClick={() => navigate('/admin')}
                style={{ cursor: 'pointer' }}
                title="View admin panel"
              >
                <MetricCard label="System Uptime" value="99.9%" />
              </div>
            </section>

            {/* Chart + Activity */}
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
              <VolumeChart data={stats.volume_chart || []} />
              <ActivityFeed items={stats.recent_activity || []} />
            </section>
          </>
        )}
      </main>
    </>
  )
}
