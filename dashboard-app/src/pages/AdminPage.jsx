import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { fetchAllCrops, fetchTranslationStatus, regenEmpty } from '../api/cropApi'

export default function AdminPage() {
  const [crops, setCrops] = useState([])
  const [transStatus, setTransStatus] = useState([])
  const [loading, setLoading] = useState(true)

  // Fix Null Stages state
  const [regenKey, setRegenKey] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenResult, setRegenResult] = useState(null)
  const [regenError, setRegenError] = useState(null)

  const handleRegenEmpty = async (e) => {
    e.preventDefault()
    if (regenKey !== import.meta.env.VITE_ADMIN_KEY) {
      setRegenError('Incorrect admin key. Please try again.')
      return
    }
    setRegenLoading(true)
    setRegenError(null)
    setRegenResult(null)
    try {
      const data = await regenEmpty()
      setRegenResult(data)
    } catch (err) {
      setRegenError(err.response?.data?.detail || err.message)
    } finally {
      setRegenLoading(false)
    }
  }

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

            {/* Fix Null Stages */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 40, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#b45309' }}>build</span>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>Fix Null / Empty Stages</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Regenerates advisory data for stages that have missing pest or disease fields. Safe — skips stages with existing data.</p>
                </div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <form onSubmit={handleRegenEmpty} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin Key</label>
                    <input
                      type="password"
                      value={regenKey}
                      onChange={e => { setRegenKey(e.target.value); setRegenError(null) }}
                      placeholder="Enter admin key to confirm"
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, width: 240 }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={regenLoading || !regenKey}
                    style={{ padding: '8px 18px', background: regenLoading ? '#9ca3af' : '#b45309', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: 13, cursor: regenLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {regenLoading
                      ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} />&nbsp;Running…</>
                      : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>&nbsp;Fix Null Stages</>
                    }
                  </button>
                </form>
                {regenError && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', fontSize: 13, color: '#dc2626' }}>{regenError}</div>
                )}
                {regenResult && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: regenResult.errors?.length ? '#fffbeb' : '#f0fdf4', border: `1px solid ${regenResult.errors?.length ? '#fef3c7' : '#bbf7d0'}`, borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: regenResult.errors?.length ? '#92400e' : '#15803d', marginBottom: 4 }}>
                      {regenResult.message}
                    </div>
                    {regenResult.errors?.length > 0 && (
                      <ul style={{ margin: '8px 0 0 16px', color: '#92400e', fontSize: 12 }}>
                        {regenResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
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
