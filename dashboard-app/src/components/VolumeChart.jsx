import { LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function VolumeChart({ data = [] }) {
  return (
    <div>
      <h3 className="section-heading">Report Generation Volume</h3>
      <div style={{ background: 'var(--surface)', padding: '24px', borderBottom: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', height: 300 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last 30 Days</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.length > 0 ? `${data[0]?.date} – ${data[data.length - 1]?.date}` : '—'}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ReLineChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="#E5E7EB" strokeWidth={0.5} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ border: '1px solid var(--border)', borderRadius: 4, fontSize: 13, fontFamily: 'Satoshi, sans-serif' }}
              labelStyle={{ color: 'var(--text-secondary)', fontWeight: 500 }}
            />
            <Line type="linear" dataKey="count" stroke="#111827" strokeWidth={2} dot={false} />
          </ReLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
