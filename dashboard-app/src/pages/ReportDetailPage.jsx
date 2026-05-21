import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import Navbar from '../components/Navbar'
import { fetchReportByUid, fetchTranslation, regenerateReport, saveReport } from '../api/cropApi'

function formatDate(ts) {
  try { return format(new Date(ts), 'MMM dd, yyyy') } catch { return ts || '' }
}

function EnvBlock({ env }) {
  if (!env || typeof env !== 'object') return null
  const labels = {
    irrigation_mm: 'Irrigation (mm/week)', temp_min_c: 'Min Temp (°C)',
    temp_max_c: 'Max Temp (°C)', optimal_temp_c: 'Optimal Temp (°C)',
    avg_yield_kg_ha: 'Avg Yield (kg/ha)', soil_moisture_pct: 'Soil Moisture (%)',
    rel_humidity_pct: 'Rel. Humidity (%)', uv_index: 'UV Index',
    soil_temp_c: 'Soil Temp (°C)', photoperiod: 'Photoperiod (hrs)',
    harvest_index_pct: 'Harvest Index (%)',
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
      {Object.entries(labels).map(([key, label]) =>
        env[key] ? (
          <div key={key} style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{env[key]}</div>
          </div>
        ) : null
      )}
    </div>
  )
}

export function parseManagementText(rawText) {
  const text = rawText || '';
  let cultural = '';
  let biological = '';
  let chemical = '';

  const culturalRegex = /(?:Cultural\s*:\s*|Cultural\s*-\s*)/i;
  const biologicalRegex = /(?:Biological\s*:\s*|Biological\s*-\s*)/i;
  const chemicalRegex = /(?:Chemical\s*:\s*|Chemical\s*-\s*)/i;

  const culturalMatch = text.match(culturalRegex);
  const biologicalMatch = text.match(biologicalRegex);
  const chemicalMatch = text.match(chemicalRegex);

  const culturalIdx = culturalMatch ? culturalMatch.index : -1;
  const biologicalIdx = biologicalMatch ? biologicalMatch.index : -1;
  const chemicalIdx = chemicalMatch ? chemicalMatch.index : -1;

  if (culturalIdx !== -1 || biologicalIdx !== -1 || chemicalIdx !== -1) {
    const markers = [
      { name: 'cultural', index: culturalIdx, length: culturalMatch ? culturalMatch[0].length : 0 },
      { name: 'biological', index: biologicalIdx, length: biologicalMatch ? biologicalMatch[0].length : 0 },
      { name: 'chemical', index: chemicalIdx, length: chemicalMatch ? chemicalMatch[0].length : 0 }
    ].filter(m => m.index !== -1).sort((a, b) => a.index - b.index);

    const preText = text.substring(0, markers.length > 0 ? markers[0].index : text.length).trim();

    for (let i = 0; i < markers.length; i++) {
      const current = markers[i];
      const start = current.index + current.length;
      const end = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
      const content = text.substring(start, end).trim();

      if (current.name === 'cultural') cultural = content;
      else if (current.name === 'biological') biological = content;
      else if (current.name === 'chemical') chemical = content;
    }

    if (preText) {
      if (cultural) {
        cultural = preText + '\n\n' + cultural;
      } else {
        cultural = preText;
      }
    }
  } else {
    cultural = text.trim();
  }

  return { cultural, biological, chemical };
}

function ManagementFieldBlock({ label, value, fieldKey, editedFields, onChange, isEditing }) {
  const parsed = parseManagementText(value)
  
  const subFields = [
    { subKey: 'cultural', label: 'Cultural:' },
    { subKey: 'biological', label: 'Biological:' },
    { subKey: 'chemical', label: 'Chemical:' }
  ]

  return (
    <div className="report-field" style={{ marginBottom: 28 }}>
      <div className="report-field-label" style={{ marginBottom: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
        {label}
      </div>
      
      <div style={{ paddingLeft: 16, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {subFields.map(({ subKey, label: subLabel }) => {
          const fullKey = `${fieldKey}_${subKey}`
          const originalVal = parsed[subKey] || ''
          const currentVal = editedFields[fullKey] !== undefined ? editedFields[fullKey] : originalVal
          const isEdited = editedFields[fullKey] !== undefined && editedFields[fullKey] !== originalVal

          return (
            <div key={subKey}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{subLabel}</span>
                {isEdited && (
                  <span style={{ fontSize: 9, color: '#b45309', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 2 }}>
                    ✏️ Edited
                  </span>
                )}
              </div>

              {isEditing ? (
                <textarea
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--surface)',
                    border: isEdited ? '1px solid #d97706' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    outline: 'none',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    transition: 'all 0.15s ease'
                  }}
                  className="detail-textarea-field"
                  value={currentVal}
                  onChange={e => onChange(fullKey, e.target.value)}
                  placeholder={`Enter ${subKey} management details…`}
                />
              ) : (
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.7', whiteSpace: 'pre-line', paddingLeft: 2 }}>
                  {currentVal || <em style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data available</em>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditableFieldBlock({ label, value, fieldKey, editedFields, onChange, isEditing }) {
  const currentVal = editedFields[fieldKey] !== undefined ? editedFields[fieldKey] : (value || '')
  const isEdited = editedFields[fieldKey] !== undefined && editedFields[fieldKey] !== value
  
  return (
    <div className="report-field" style={{ marginBottom: 24 }}>
      <div className="report-field-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span>{label}</span>
        {isEdited && (
          <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
            ✏️ Edited
          </span>
        )}
      </div>
      
      {isEditing ? (
        <textarea
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '12px 14px',
            fontSize: '15px',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--surface)',
            border: isEdited ? '1px solid #d97706' : '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
            lineHeight: '1.7',
            resize: 'vertical',
            transition: 'all 0.15s ease'
          }}
          className="detail-textarea-field"
          value={currentVal}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}…`}
        />
      ) : (
        <div style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: '1.75', whiteSpace: 'pre-line', padding: '2px 0' }}>
          {currentVal || <em style={{ color: 'var(--text-muted)' }}>No data available</em>}
        </div>
      )}
    </div>
  )
}

export default function ReportDetailPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [translation, setTranslation] = useState(null)
  const [lang, setLang] = useState('en')
  const [isEditing, setIsEditing] = useState(false)
  
  // Save & edit states
  const [editedFields, setEditedFields] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [regen, setRegen] = useState(false)     // regenerating in progress
  const [regenError, setRegenError] = useState(null)
  const [error, setError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleCancel = () => {
    setEditedFields({})
    setIsEditing(false)
    setSaveSuccess(false)
  }

  // Verification state from localStorage
  const [verifiedUids, setVerifiedUids] = useState(() => {
    try {
      const stored = localStorage.getItem('verified_report_uids')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })

  const isVerified = verifiedUids.includes(uid)

  useEffect(() => {
    setLoading(true)
    fetchReportByUid(uid)
      .then(setReport)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [uid])

  const handleLangToggle = async (l) => {
    setLang(l)
    if (l === 'kn' && !translation) {
      try {
        const t = await fetchTranslation(uid, 'kn')
        setTranslation(t)
      } catch { setTranslation(null) }
    }
  }

  const handleFieldChange = (key, value) => {
    setEditedFields(prev => ({ ...prev, [key]: value }))
    setSaveSuccess(false)
  }

  const hasChanges = Object.keys(editedFields).length > 0

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    const originalPestParsed = parseManagementText(report.pest_management)
    const originalDiseaseParsed = parseManagementText(report.disease_management)

    const pestCultural = editedFields.pest_management_cultural !== undefined ? editedFields.pest_management_cultural : originalPestParsed.cultural
    const pestBiological = editedFields.pest_management_biological !== undefined ? editedFields.pest_management_biological : originalPestParsed.biological
    const pestChemical = editedFields.pest_management_chemical !== undefined ? editedFields.pest_management_chemical : originalPestParsed.chemical

    const diseaseCultural = editedFields.disease_management_cultural !== undefined ? editedFields.disease_management_cultural : originalDiseaseParsed.cultural
    const diseaseBiological = editedFields.disease_management_biological !== undefined ? editedFields.disease_management_biological : originalDiseaseParsed.biological
    const diseaseChemical = editedFields.disease_management_chemical !== undefined ? editedFields.disease_management_chemical : originalDiseaseParsed.chemical

    const pestCombined = `Cultural: ${pestCultural.trim()}\n\nBiological: ${pestBiological.trim()}\n\nChemical: ${pestChemical.trim()}`
    const diseaseCombined = `Cultural: ${diseaseCultural.trim()}\n\nBiological: ${diseaseBiological.trim()}\n\nChemical: ${diseaseChemical.trim()}`

    const payload = {
      susceptible_pests: editedFields.susceptible_pests !== undefined ? editedFields.susceptible_pests : report.susceptible_pests,
      pest_risk_factors: editedFields.pest_risk_factors !== undefined ? editedFields.pest_risk_factors : report.pest_risk_factors,
      pest_management: pestCombined,
      susceptible_diseases: editedFields.susceptible_diseases !== undefined ? editedFields.susceptible_diseases : report.susceptible_diseases,
      disease_risk_factors: editedFields.disease_risk_factors !== undefined ? editedFields.disease_risk_factors : report.disease_risk_factors,
      disease_management: diseaseCombined,
    }

    try {
      const updated = await saveReport(uid, payload)
      setReport(updated)
      setEditedFields({})
      setIsEditing(false)
      setSaveSuccess(true)

      // Auto-verify on successful manual save
      if (!verifiedUids.includes(uid)) {
        const newList = [...verifiedUids, uid]
        setVerifiedUids(newList)
        localStorage.setItem('verified_report_uids', JSON.stringify(newList))
      }
      
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (e) {
      setError('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyManually = () => {
    if (!verifiedUids.includes(uid)) {
      const newList = [...verifiedUids, uid]
      setVerifiedUids(newList)
      localStorage.setItem('verified_report_uids', JSON.stringify(newList))
    }
  }

  const handleRegenerate = async () => {
    setRegen(true)
    setRegenError(null)
    try {
      const newData = await regenerateReport(uid)
      // Navigate to diff comparison — original stays intact
      navigate(`/reports/${uid}/compare`, { state: { original: report, regenerated: newData } })
    } catch (e) {
      setRegenError('Regeneration failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setRegen(false)
    }
  }

  const displayKn = lang === 'kn' && translation
  const envParsed = report?.env_conditions
    ? (typeof report.env_conditions === 'string' ? JSON.parse(report.env_conditions) : report.env_conditions)
    : null

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 40px 80px' }}>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 16 }}>
          <div className="breadcrumb" style={{ margin: 0, paddingTop: 6 }}>
            <Link to="/dashboard">Home</Link>
            <span>/</span>
            <Link to="/reports">Reports</Link>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{report?.crop_name || '…'}</span>
          </div>
          
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {/* Language Selector */}
            <div className="lang-toggle">
              <button className={lang === 'en' ? 'active' : ''} onClick={() => handleLangToggle('en')}>EN</button>
              <button className={lang === 'kn' ? 'active' : ''} onClick={() => handleLangToggle('kn')}>ಕನ್ನಡ</button>
            </div>

            {/* English Actions */}
            {lang === 'en' && report && (
              isEditing ? (
                <>
                  <button className="btn btn-outline" onClick={handleCancel}>
                    Cancel
                  </button>
                  <button
                    className="btn"
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    style={{
                      border: '1.5px solid #000000',
                      color: '#000000',
                      background: 'transparent',
                      fontWeight: 600,
                      opacity: hasChanges ? 1 : 0.5,
                      cursor: hasChanges ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      if (hasChanges && !saving) {
                        e.currentTarget.style.backgroundColor = '#000000';
                        e.currentTarget.style.color = '#ffffff';
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#000000';
                    }}
                  >
                    {saving ? (
                      <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#000000', borderColor: 'rgba(0,0,0,0.1)' }} />&nbsp;Saving…</>
                    ) : (
                      <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>&nbsp;Save Changes</>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-outline" onClick={() => setIsEditing(true)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>&nbsp;Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleRegenerate}
                    disabled={regen || loading}
                    style={{
                      minWidth: 120,
                      justifyContent: 'center',
                      backgroundColor: '#1354ec',
                      borderColor: '#1354ec',
                      color: '#ffffff',
                      fontWeight: 600,
                      boxShadow: '0 2px 4px rgba(19, 84, 236, 0.15)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseOver={(e) => {
                      if (!regen && !loading) {
                        e.currentTarget.style.backgroundColor = '#0e43c4';
                        e.currentTarget.style.borderColor = '#0e43c4';
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = '#1354ec';
                      e.currentTarget.style.borderColor = '#1354ec';
                    }}
                  >
                    {regen
                      ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} />&nbsp;Regenerating…</>
                      : <><span className="material-symbols-outlined" style={{ fontSize: 17 }}>refresh</span>&nbsp;Regenerate</>
                    }
                  </button>
                </>
              )
            )}

            {/* Kannada Actions */}
            {lang === 'kn' && report && (
              <button
                className="btn btn-primary"
                onClick={handleRegenerate}
                disabled={regen || loading}
                style={{
                  minWidth: 120,
                  justifyContent: 'center',
                  backgroundColor: '#1354ec',
                  borderColor: '#1354ec',
                  color: '#ffffff',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(19, 84, 236, 0.15)',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  if (!regen && !loading) {
                    e.currentTarget.style.backgroundColor = '#0e43c4';
                    e.currentTarget.style.borderColor = '#0e43c4';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#1354ec';
                  e.currentTarget.style.borderColor = '#1354ec';
                }}
              >
                {regen
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} />&nbsp;Regenerating…</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 17 }}>refresh</span>&nbsp;Regenerate</>
                }
              </button>
            )}
          </div>
        </div>

        {/* ── Save Success notification banner ─────────────────────────────── */}
        {saveSuccess && (
          <div style={{ background: '#eafaf1', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24, fontSize: 14, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
            Report successfully saved and marked as Manually Verified!
          </div>
        )}

        {/* ── Regen error banner ───────────────────────────────────────────── */}
        {regenError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24, fontSize: 13, color: 'var(--danger)' }}>
            {regenError}
          </div>
        )}

        {/* ── Regen in-progress banner ──────────────────────────────────────── */}
        {regen && (
          <div style={{ background: '#eff4ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24, fontSize: 13, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Calling Gemini 2.5 Flash to regenerate this report… this may take a few seconds.
          </div>
        )}

        {/* ── Page loading ─────────────────────────────────────────────────── */}
        {loading && (
          <div className="loading-page" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <span>Loading report…</span>
          </div>
        )}
        {error && <p style={{ color: 'var(--danger)', marginBottom: 24 }}>Error: {error}</p>}

        {/* ── Report content ───────────────────────────────────────────────── */}
        {report && !loading && (
          <>
            {/* Header */}
            <div className="report-detail-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                <h1 className="report-detail-title" style={{ fontSize: 36, fontWeight: 700, margin: 0 }}>
                  {displayKn ? (translation.crop_name_local || report.crop_name) : report.crop_name}
                  {' — '}
                  {displayKn ? (translation.stage_name_local || report.sub_stage_name) : report.sub_stage_name}
                </h1>
                
                {/* Manual Verification Badge at top */}
                {isVerified && (
                  <span className="badge" style={{ color: '#16a34a', background: '#eafaf1', border: '1px solid #bbf7d0', fontWeight: 700, padding: '4px 10px', fontSize: 12 }}>
                    VERIFIED MANUALLY
                  </span>
                )}
              </div>
              <div className="report-detail-meta">
                <span>CROP: {report.crop_name}</span>
                <span>·</span>
                <span>{formatDate(report.updated_at)}</span>
                <span>·</span>
                <span>PHASE: {displayKn ? (translation?.phase_name_local || report.main_stage) : report.main_stage}</span>
                <span>·</span>
                <span>DAY {report.start_day}–{report.end_day}</span>
              </div>
            </div>

            <hr className="divider" />

            {/* ── Pest Section ───────────────────────────────────────────────── */}
            <section className="report-section">
              <h2 className="report-section-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                🪲 Pest Information
              </h2>
              {displayKn ? (
                <div className="report-field-value" style={{ fontSize: 16, lineHeight: 1.9 }}>{translation.pest_data_local || 'No Kannada translation available.'}</div>
              ) : (
                <>
                  <EditableFieldBlock
                    label="Susceptible Pests"
                    value={report.susceptible_pests}
                    fieldKey="susceptible_pests"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                  <EditableFieldBlock
                    label="Pest Risk Factors"
                    value={report.pest_risk_factors}
                    fieldKey="pest_risk_factors"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                  <ManagementFieldBlock
                    label="Pest Management"
                    value={report.pest_management}
                    fieldKey="pest_management"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                </>
              )}
            </section>

            <hr className="divider" />

            {/* ── Disease Section ─────────────────────────────────────────────── */}
            <section className="report-section">
              <h2 className="report-section-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                🌿 Disease Information
              </h2>
              {displayKn ? (
                <div className="report-field-value" style={{ fontSize: 16, lineHeight: 1.9 }}>{translation.disease_data_local || 'No Kannada translation available.'}</div>
              ) : (
                <>
                  <EditableFieldBlock
                    label="Susceptible Diseases"
                    value={report.susceptible_diseases}
                    fieldKey="susceptible_diseases"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                  <EditableFieldBlock
                    label="Disease Risk Factors"
                    value={report.disease_risk_factors}
                    fieldKey="disease_risk_factors"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                  <ManagementFieldBlock
                    label="Disease Management"
                    value={report.disease_management}
                    fieldKey="disease_management"
                    editedFields={editedFields}
                    onChange={handleFieldChange}
                    isEditing={isEditing}
                  />
                </>
              )}
            </section>

            {/* ── Environmental Conditions ────────────────────────────────────── */}
            {envParsed && (
              <>
                <hr className="divider" />
                <section className="report-section">
                  <h2 className="report-section-title" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
                    🌡️ Environmental Conditions
                  </h2>
                  {displayKn && translation?.env_data_local ? (
                    <div className="report-field-value" style={{ fontSize: 16, lineHeight: 1.9 }}>{translation.env_data_local}</div>
                  ) : (
                    <EnvBlock env={envParsed} />
                  )}
                </section>
              </>
            )}

            {!isVerified && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32, marginBottom: 24 }}>
                <button
                  className="btn"
                  onClick={handleVerifyManually}
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    boxShadow: '0 2px 4px rgba(22, 163, 74, 0.15)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#15803d';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#16a34a';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                  Verify Manually
                </button>
              </div>
            )}

            <div className="info-row">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>UID: {report.uid}</span>
              <div>
                {isVerified ? (
                  <span className="badge" style={{ color: '#16a34a', background: '#eafaf1', border: '1px solid #bbf7d0', fontWeight: 700 }}>
                    VERIFIED MANUALLY
                  </span>
                ) : (
                  <span className={`badge ${report.data_source === 'llm' ? 'badge-llm' : 'badge-csv'}`}>
                    {report.data_source?.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <style>{`
        .detail-textarea-field:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(19, 84, 236, 0.1);
          background-color: #fafbfc !important;
        }
      `}</style>
    </>
  )
}
