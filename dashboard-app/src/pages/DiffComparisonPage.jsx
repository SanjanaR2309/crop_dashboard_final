import { useState, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { saveReport } from '../api/cropApi'
import { parseManagementText } from './ReportDetailPage'

const FIELDS = [
  { key: 'susceptible_pests',    label: 'Susceptible Pests' },
  { key: 'pest_risk_factors',    label: 'Pest Risk Factors' },
  { key: 'pest_management',      label: 'Pest Management' },
  { key: 'susceptible_diseases', label: 'Susceptible Diseases' },
  { key: 'disease_risk_factors', label: 'Disease Risk Factors' },
  { key: 'disease_management',   label: 'Disease Management' },
]

function DiffField({ fieldKey, label, original, regenerated, editedValues, onEdit }) {
  const isSame = original === regenerated
  const isEdited = editedValues[fieldKey] !== undefined && editedValues[fieldKey] !== regenerated
  const currentVal = editedValues[fieldKey] ?? regenerated ?? ''

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {/* Original */}
        <div style={{ paddingRight: 20 }}>
          {isSame
            ? <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{original || <em style={{ color: 'var(--text-muted)' }}>No data</em>}</p>
            : <div className="diff-block-removed">{original || <em>No data</em>}</div>
          }
        </div>
        {/* Regenerated (editable) */}
        <div style={{ paddingLeft: 20 }}>
          <div className={`diff-block-added ${isEdited ? 'diff-field-edited' : ''}`}>
            <textarea
              className="diff-editable"
              value={currentVal}
              onChange={e => onEdit(fieldKey, e.target.value)}
              style={{ background: 'transparent', width: '100%' }}
            />
          </div>
          {isEdited && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Manually edited</div>}
        </div>
      </div>
    </div>
  )
}

function ManagementDiffField({ fieldKey, label, original, regenerated, editedValues, onEdit }) {
  const origParsed = parseManagementText(original)
  const regenParsed = parseManagementText(regenerated)

  const subFields = [
    { subKey: 'cultural', label: 'Cultural:' },
    { subKey: 'biological', label: 'Biological:' },
    { subKey: 'chemical', label: 'Chemical:' }
  ]

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        {label}
      </div>
      
      <div style={{ paddingLeft: 16, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {subFields.map(({ subKey, label: subLabel }) => {
          const fullKey = `${fieldKey}_${subKey}`
          const origVal = origParsed[subKey] || ''
          const regenVal = regenParsed[subKey] || ''
          
          const isSameVal = origVal === regenVal
          const isEditedVal = editedValues[fullKey] !== undefined && editedValues[fullKey] !== regenVal
          const currentVal = editedValues[fullKey] ?? regenVal ?? ''

          return (
            <div key={subKey}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {subLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Original v1.0 */}
                <div style={{ paddingRight: 20 }}>
                  {isSameVal
                    ? <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>{origVal || <em style={{ color: 'var(--text-muted)' }}>No data</em>}</p>
                    : <div className="diff-block-removed" style={{ margin: 0 }}>{origVal || <em>No data</em>}</div>
                  }
                </div>
                {/* Regenerated v2.0 */}
                <div style={{ paddingLeft: 20 }}>
                  <div className={`diff-block-added ${isEditedVal ? 'diff-field-edited' : ''}`} style={{ margin: 0 }}>
                    <textarea
                      className="diff-editable"
                      value={currentVal}
                      onChange={e => onEdit(fullKey, e.target.value)}
                      style={{ background: 'transparent', width: '100%', minHeight: '80px' }}
                    />
                  </div>
                  {isEditedVal && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Manually edited</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DiffComparisonPage() {
  const { uid } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { original, regenerated } = location.state || {}

  const [editedValues, setEditedValues] = useState({})
  const [saving, setSaving] = useState(false)

  if (!original || !regenerated) {
    return (
      <>
        <Navbar />
        <div className="loading-page">
          <p>No comparison data. <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>Go back</button></p>
        </div>
      </>
    )
  }

  const handleEdit = (key, value) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const handleAccept = async () => {
    setSaving(true)

    const originalPestParsed = parseManagementText(original.pest_management)
    const originalDiseaseParsed = parseManagementText(original.disease_management)
    
    const regeneratedPestParsed = parseManagementText(regenerated.pest_management)
    const regeneratedDiseaseParsed = parseManagementText(regenerated.disease_management)

    const pestCultural = editedValues.pest_management_cultural !== undefined ? editedValues.pest_management_cultural : regeneratedPestParsed.cultural
    const pestBiological = editedValues.pest_management_biological !== undefined ? editedValues.pest_management_biological : regeneratedPestParsed.biological
    const pestChemical = editedValues.pest_management_chemical !== undefined ? editedValues.pest_management_chemical : regeneratedPestParsed.chemical

    const diseaseCultural = editedValues.disease_management_cultural !== undefined ? editedValues.disease_management_cultural : regeneratedDiseaseParsed.cultural
    const diseaseBiological = editedValues.disease_management_biological !== undefined ? editedValues.disease_management_biological : regeneratedDiseaseParsed.biological
    const diseaseChemical = editedValues.disease_management_chemical !== undefined ? editedValues.disease_management_chemical : regeneratedDiseaseParsed.chemical

    const pestCombined = `Cultural: ${pestCultural.trim()}\n\nBiological: ${pestBiological.trim()}\n\nChemical: ${pestChemical.trim()}`
    const diseaseCombined = `Cultural: ${diseaseCultural.trim()}\n\nBiological: ${diseaseBiological.trim()}\n\nChemical: ${diseaseChemical.trim()}`

    const payload = {}
    FIELDS.forEach(({ key }) => {
      if (key === 'pest_management') {
        payload[key] = pestCombined
      } else if (key === 'disease_management') {
        payload[key] = diseaseCombined
      } else {
        payload[key] = editedValues[key] ?? regenerated[key]
      }
    })

    try {
      await saveReport(uid, payload)
      
      // Auto-verify on revision accept
      try {
        const stored = localStorage.getItem('verified_report_uids')
        const verifiedList = stored ? JSON.parse(stored) : []
        if (!verifiedList.includes(uid)) {
          verifiedList.push(uid)
          localStorage.setItem('verified_report_uids', JSON.stringify(verifiedList))
        }
      } catch (err) {
        console.error('Failed to save to localStorage:', err)
      }

      navigate(`/reports/${uid}`, { replace: true })
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => navigate(`/reports/${uid}`)

  return (
    <>
      <Navbar />
      {/* Header */}
      <div style={{ padding: '24px 40px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={handleDiscard} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
            {original.crop_name} — {original.sub_stage_name}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Reviewing changes before final approval</p>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ padding: '14px 40px', borderRight: '1px solid var(--border)' }}>
          <span className="diff-panel-label" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>v1.0 (Original)</span>
        </div>
        <div style={{ padding: '14px 40px' }}>
          <span className="diff-panel-label" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--primary)' }}>
            v2.0 (Regenerated)
            <span className="draft-tag">Draft</span>
          </span>
        </div>
      </div>

      {/* Diff Content */}
      <div style={{ padding: '40px 40px 120px', maxWidth: 1200, margin: '0 auto' }}>
        {FIELDS.map(({ key, label }) => {
          if (key === 'pest_management' || key === 'disease_management') {
            return (
              <ManagementDiffField
                key={key}
                fieldKey={key}
                label={label}
                original={original[key]}
                regenerated={regenerated[key]}
                editedValues={editedValues}
                onEdit={handleEdit}
              />
            )
          }
          return (
            <DiffField
              key={key}
              fieldKey={key}
              label={label}
              original={original[key]}
              regenerated={regenerated[key]}
              editedValues={editedValues}
              onEdit={handleEdit}
            />
          )
        })}
      </div>

      {/* Sticky footer */}
      <div className="diff-footer">
        <button className="btn btn-outline" onClick={handleDiscard}>Discard Changes</button>
        <button className="btn btn-primary" onClick={handleAccept} disabled={saving}>
          {saving
            ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</>
            : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span> Accept Revision</>
          }
        </button>
      </div>
    </>
  )
}
