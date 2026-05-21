import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { fetchAllCrops, fetchTranslationStatus } from '../api/cropApi'

export default function AdminPage() {
  const [crops, setCrops] = useState([])
  const [transStatus, setTransStatus] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchAllCrops(), fetchTranslationStatus()])
      .then(([c, t]) => { setCrops(c); setTransStatus(t) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 40px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Admin Panel</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6 }}>Overview of crop knowledge data and translation health.</p>
        </div>

        {loading && <div className="loading-page"><div className="spinner" /></div>}

        {!loading && (
          <>
            {/* Summary Cards */}
            <div className="admin-grid" style={{ marginBottom: 48 }}>
              <div className="admin-card">
                <div className="admin-card-title">Total Crops</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {crops.length}
                </p>
              </div>
              <div className="admin-card">
                <div className="admin-card-title">Stages with Kannada Translation</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--success)', letterSpacing: '-0.02em' }}>
                  {transStatus.filter(t => t.has_kn).length}
                  <span style={{ fontSize: 16, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)', marginLeft: 8 }}>/ {transStatus.length}</span>
                </p>
              </div>
              <div className="admin-card">
                <div className="admin-card-title">Missing Kannada Translations</div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: transStatus.filter(t => !t.has_kn).length > 0 ? 'var(--danger)' : 'var(--success)', letterSpacing: '-0.02em' }}>
                  {transStatus.filter(t => !t.has_kn).length}
                </p>
              </div>
            </div>

            {/* Crops Table */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 40 }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>Crop Index</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Crop Name</th>
                    <th>Stage Count</th>
                    <th>LLM Stages</th>
                    <th>CSV Stages</th>
                    <th>Kannada Status</th>
                  </tr>
                </thead>
                <tbody>
                  {crops.map(c => (
                    <tr key={c.crop_name}>
                      <td style={{ fontWeight: 500 }}>{c.crop_name}</td>
                      <td>{c.total_stages}</td>
                      <td>{c.llm_stages}</td>
                      <td>{c.csv_stages}</td>
                      <td>
                        <span className={`badge ${c.kn_translated_stages === c.total_stages ? 'badge-csv' : 'badge-pending'}`}>
                          {c.kn_translated_stages} / {c.total_stages}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {crops.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Translation Status Table */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>Translation Status</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Showing stages missing Kannada translations</p>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Crop</th>
                    <th>Sub-Stage</th>
                    <th>Phase</th>
                    <th>Days</th>
                    <th>Kannada</th>
                  </tr>
                </thead>
                <tbody>
                  {transStatus.filter(t => !t.has_kn).slice(0, 50).map(t => (
                    <tr key={t.uid}>
                      <td style={{ fontWeight: 500 }}>{t.crop_name}</td>
                      <td>{t.sub_stage_name}</td>
                      <td>{t.main_stage}</td>
                      <td>{t.start_day}–{t.end_day}</td>
                      <td><span className="badge badge-pending">Missing</span></td>
                    </tr>
                  ))}
                  {transStatus.filter(t => !t.has_kn).length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--success)', textAlign: 'center', padding: 24, fontWeight: 500 }}>✓ All stages have Kannada translations</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  )
}
