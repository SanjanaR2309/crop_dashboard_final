import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { fetchReports, generateCropReport, deleteCrop } from '../api/cropApi'

export default function ReportsArchivePage() {
  const navigate = useNavigate()
  
  // Add Crop states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newCropName, setNewCropName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [generateSuccess, setGenerateSuccess] = useState(null)

  // Delete Crop states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [cropToDelete, setCropToDelete] = useState(null)
  const [confirmAdminKey, setConfirmAdminKey] = useState('')
  const [deleteError, setDeleteError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleInitiateDelete = (cropName) => {
    setCropToDelete(cropName)
    setConfirmAdminKey('')
    setDeleteError(null)
    setIsDeleting(false)
    setIsDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    if (isDeleting) return
    setIsDeleteModalOpen(false)
    setCropToDelete(null)
    setConfirmAdminKey('')
    setDeleteError(null)
  }

  const handleConfirmDelete = async (e) => {
    e.preventDefault()
    if (!cropToDelete) return

    if (confirmAdminKey !== import.meta.env.VITE_ADMIN_KEY) {
      setDeleteError('Incorrect Admin Key. Delete authorization failed.')
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const res = await deleteCrop(cropToDelete)
      if (res.success) {
        setGenerateSuccess(`Successfully deleted "${cropToDelete}" and all its growth stages from the database!`)
        setIsDeleteModalOpen(false)
        setCropToDelete(null)
        setConfirmAdminKey('')
        
        // Reload all reports to update tree and filters
        setLoading(true)
        const updatedData = await fetchReports({ page: 1, page_size: 1000 })
        const items = updatedData.items || []
        setAllReports(items)
        setLoading(false)
        
        setTimeout(() => {
          setGenerateSuccess(null)
        }, 8000)
      } else {
        setDeleteError('Delete failed. Please try again.')
      }
    } catch (err) {
      console.error(err)
      setLoading(false)
      if (err.response && err.response.data && err.response.data.detail) {
        setDeleteError(err.response.data.detail)
      } else {
        setDeleteError('Error deleting crop report. Please check API connection.')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const closeAddModal = () => {
    if (isGenerating) return
    setIsAddModalOpen(false)
    setNewCropName('')
    setGenerateError(null)
  }

  const handleGenerateCrop = async (e) => {
    e.preventDefault()
    const name = newCropName.trim()
    if (!name) return

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const res = await generateCropReport(name)
      if (res.success) {
        setGenerateSuccess(`Successfully generated full report for "${name}" with ${res.stages_count} growth stages!`)
        setIsAddModalOpen(false)
        setNewCropName('')
        
        // Reload all reports to update tree and filters
        setLoading(true)
        const updatedData = await fetchReports({ page: 1, page_size: 1000 })
        const items = updatedData.items || []
        setAllReports(items)
        setLoading(false)
        
        // Auto-expand and clear filters so the new crop is visible
        clearFilters()
        setExpandedCrops(prev => ({ ...prev, [name]: true }))
        
        setTimeout(() => {
          setGenerateSuccess(null)
        }, 8000)
      } else {
        setGenerateError('Generation failed. Please try again.')
      }
    } catch (err) {
      console.error(err)
      setLoading(false)
      if (err.response && err.response.data && err.response.data.detail) {
        setGenerateError(err.response.data.detail)
      } else {
        setGenerateError('Error generating crop report. Please check API connection.')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  // Core states
  const [allReports, setAllReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCrops, setSelectedCrops] = useState([])
  const [selectedPhases, setSelectedPhases] = useState([])
  const [selectedSubStages, setSelectedSubStages] = useState([])
  const [selectedStatuses, setSelectedStatuses] = useState([])

  // Expanded tree states
  const [expandedCrops, setExpandedCrops] = useState({})
  const [expandedPhases, setExpandedPhases] = useState({})

  // Verification state loaded from localStorage
  const [verifiedUids, setVerifiedUids] = useState(() => {
    try {
      const stored = localStorage.getItem('verified_report_uids')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Load all reports once (we request a high page_size so we have full tree capacity)
  useEffect(() => {
    setLoading(true)
    fetchReports({ page: 1, page_size: 1000 })
      .then(data => {
        const items = data.items || []
        setAllReports(items)
        
        // Keep crops collapsed by default
        setExpandedCrops({})
      })
      .catch(err => {
        console.error(err)
        setError('Failed to load crop reports.')
      })
      .finally(() => setLoading(false))
  }, [])

  // Listen for storage events (e.g. if updated from another page)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = localStorage.getItem('verified_report_uids')
        setVerifiedUids(stored ? JSON.parse(stored) : [])
      } catch {}
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Dynamically extract unique options for sidebar filters from the full list
  const filterOptions = useMemo(() => {
    const crops = new Set()
    const phases = new Set()
    const substages = new Set()

    allReports.forEach(r => {
      if (r.crop_name) crops.add(r.crop_name)
      if (r.main_stage) phases.add(r.main_stage)
      if (r.sub_stage_name) substages.add(r.sub_stage_name)
    })

    return {
      crops: [...crops].sort(),
      phases: [...phases].sort(),
      substages: [...substages].sort()
    }
  }, [allReports])

  // Filter application logic
  const filteredReports = useMemo(() => {
    return allReports.filter(r => {
      // 1. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          (r.crop_name || '').toLowerCase().includes(q) ||
          (r.main_stage || '').toLowerCase().includes(q) ||
          (r.sub_stage_name || '').toLowerCase().includes(q)
        if (!match) return false
      }

      // 2. Crop filter
      if (selectedCrops.length > 0 && !selectedCrops.includes(r.crop_name)) {
        return false
      }

      // 3. Phase filter
      if (selectedPhases.length > 0 && !selectedPhases.includes(r.main_stage)) {
        return false
      }

      // 4. Sub-stage filter
      if (selectedSubStages.length > 0 && !selectedSubStages.includes(r.sub_stage_name)) {
        return false
      }

      // 5. Status filter
      if (selectedStatuses.length > 0) {
        const isVerified = !!(r.env_conditions && Object.keys(r.env_conditions).length > 0) && verifiedUids.includes(r.uid)
        const isLlm = r.data_source === 'llm'
        const isCsv = r.data_source === 'csv'

        const matchStatus = selectedStatuses.some(status => {
          if (status === 'verified') return isVerified
          if (status === 'reviewed') return !isVerified && isLlm
          if (status === 'unreviewed') return !isVerified && isCsv
          return false
        })
        if (!matchStatus) return false
      }

      return true
    })
  }, [allReports, searchQuery, selectedCrops, selectedPhases, selectedSubStages, selectedStatuses, verifiedUids])

  // Group filtered reports into Crops -> Phases -> Sub-Stages
  const groupedTree = useMemo(() => {
    const tree = {}
    filteredReports.forEach(r => {
      const crop = r.crop_name || 'Unknown Crop'
      const phase = r.main_stage || 'Unknown Phase'

      if (!tree[crop]) {
        tree[crop] = {
          crop_name: crop,
          latest_date: r.updated_at,
          phases: {}
        }
      }

      // Track latest updated date for crop level
      if (new Date(r.updated_at) > new Date(tree[crop].latest_date)) {
        tree[crop].latest_date = r.updated_at
      }

      if (!tree[crop].phases[phase]) {
        tree[crop].phases[phase] = {
          phase_name: phase,
          subStages: []
        }
      }

      tree[crop].phases[phase].subStages.push(r)
    })

    // Sort sub-stages in chronological order of days
    Object.values(tree).forEach(c => {
      Object.values(c.phases).forEach(p => {
        p.subStages.sort((a, b) => (a.start_day ?? 0) - (b.start_day ?? 0))
      })
    })

    return tree
  }, [filteredReports])

  // Toggles
  const toggleCrop = (cropName) => {
    setExpandedCrops(prev => ({ ...prev, [cropName]: !prev[cropName] }))
  }

  const togglePhase = (cropName, phaseName) => {
    const key = `${cropName}|${phaseName}`
    setExpandedPhases(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleFilter = (val, list, setList) => {
    setList(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val])
  }

  const clearFilters = () => {
    setSelectedCrops([])
    setSelectedPhases([])
    setSelectedSubStages([])
    setSelectedStatuses([])
    setSearchQuery('')
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    try {
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return ts
    }
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 40px 100px' }}>
        
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Reports</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 48, alignItems: 'flex-start' }}>
          
          {/* ── Sidebar Filters ─────────────────────────────────────────────── */}
          <aside className="filter-sidebar" style={{ background: 'var(--surface)', padding: '24px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>Filters</div>
              <button 
                onClick={clearFilters} 
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, padding: 0 }}
              >
                Reset All
              </button>
            </div>

            {/* Filter: Review Status */}
            <div className="filter-group">
              <div className="filter-group-label">Review Status</div>
              <label className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('verified')}
                  onChange={() => toggleFilter('verified', selectedStatuses, setSelectedStatuses)}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }}></span>
                  Manually Verified
                </span>
              </label>
              <label className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('reviewed')}
                  onChange={() => toggleFilter('reviewed', selectedStatuses, setSelectedStatuses)}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }}></span>
                  Reviewed (LLM)
                </span>
              </label>
              <label className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes('unreviewed')}
                  onChange={() => toggleFilter('unreviewed', selectedStatuses, setSelectedStatuses)}
                />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c2410c' }}></span>
                  Yet to be reviewed
                </span>
              </label>
            </div>

            {/* Filter: Crops */}
            {filterOptions.crops.length > 0 && (
              <div className="filter-group">
                <div className="filter-group-label">Crops</div>
                <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                  {filterOptions.crops.map(crop => (
                    <label key={crop} className="filter-option" style={{ textTransform: 'capitalize' }}>
                      <input
                        type="checkbox"
                        checked={selectedCrops.includes(crop)}
                        onChange={() => toggleFilter(crop, selectedCrops, setSelectedCrops)}
                      />
                      {crop}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Filter: Growth Phases */}
            {filterOptions.phases.length > 0 && (
              <div className="filter-group">
                <div className="filter-group-label">Phases</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                  {filterOptions.phases.map(phase => (
                    <label key={phase} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedPhases.includes(phase)}
                        onChange={() => toggleFilter(phase, selectedPhases, setSelectedPhases)}
                      />
                      {phase}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Filter: Sub Stages */}
            {filterOptions.substages.length > 0 && (
              <div className="filter-group">
                <div className="filter-group-label">Sub Stages</div>
                <div style={{ maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                  {filterOptions.substages.map(sub => (
                    <label key={sub} className="filter-option">
                      <input
                        type="checkbox"
                        checked={selectedSubStages.includes(sub)}
                        onChange={() => toggleFilter(sub, selectedSubStages, setSelectedSubStages)}
                      />
                      {sub}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── Main Area ─────────────────────────────────────────────────── */}
          <div>
            {/* Success Banner */}
            {generateSuccess && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                padding: '16px 24px',
                borderRadius: '8px',
                fontSize: 14,
                fontWeight: 500,
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <span className="material-symbols-outlined" style={{ color: '#059669' }}>check_circle</span>
                <span>{generateSuccess}</span>
              </div>
            )}

            {/* Search Bar & Actions */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
              <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  placeholder="Search by crop, growth phase, sub-stage or keyword…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              
              <button 
                onClick={() => setIsAddModalOpen(true)}
                className="btn-add-crop"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Add Crop
              </button>
            </div>

            {/* Live Count Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, fontSize: 13, color: 'var(--text-secondary)' }}>
              <div>
                Showing <strong>{filteredReports.length}</strong> matching stages 
                {filteredReports.length !== allReports.length && ' (filtered)'}
              </div>
            </div>

            {/* Loading / Error States */}
            {loading && (
              <div style={{ padding: '80px 0', textAlign: 'center' }}>
                <div className="spinner" />
                <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>Loading crop database…</div>
              </div>
            )}

            {error && (
              <div style={{ padding: '40px 24px', background: '#fef2f2', border: '1px solid #fca5a5', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: 14 }}>
                {error}
              </div>
            )}

            {/* Three-Tier Interactive Tree View */}
            {!loading && !error && (
              <div className="reports-tree-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filteredReports.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '32px 0', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                    No reports match the current filter selection.
                  </p>
                )}

                {Object.values(groupedTree).sort((a, b) => a.crop_name.localeCompare(b.crop_name)).map(crop => {
                  const isCropExpanded = !!expandedCrops[crop.crop_name]
                  
                  // Calculate dynamic verification stats for the crop (env_conditions + manual verify = verified)
                  const allCropStages = Object.values(crop.phases).flatMap(p => p.subStages)
                  const cropTotalCount = allCropStages.length
                  const cropVerifiedCount = allCropStages.filter(s => !!(s.env_conditions && Object.keys(s.env_conditions).length > 0) && verifiedUids.includes(s.uid)).length
                  const isCropFullyVerified = cropVerifiedCount === cropTotalCount && cropTotalCount > 0

                  return (
                    <div 
                      key={crop.crop_name} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
                    >
                      {/* Tier 1: Crop Row */}
                      <div 
                        style={{ 
                          padding: '18px 24px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          background: '#fafafa',
                          borderBottom: isCropExpanded ? '1px solid var(--border)' : 'none'
                        }}
                      >
                        <div 
                          onClick={() => toggleCrop(crop.crop_name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, userSelect: 'none' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-secondary)', transform: isCropExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                            chevron_right
                          </span>
                          <span style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            {crop.crop_name}
                            {isCropFullyVerified ? (
                              <span style={{ fontSize: 11, color: '#16a34a', background: '#eafaf1', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '100px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12, fontWeight: 800 }}>verified</span> Fully Verified
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', padding: '2px 8px', borderRadius: '100px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>hourglass_empty</span> {cropVerifiedCount}/{cropTotalCount} Verified
                              </span>
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Latest Update: {formatDate(crop.latest_date)}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInitiateDelete(crop.crop_name);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--danger)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              padding: '4px',
                              borderRadius: '4px',
                              transition: 'all 0.2s',
                            }}
                            className="delete-crop-btn"
                            title={`Delete ${crop.crop_name}`}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#dc2626' }}>delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Tier 2: Phases (indented inside Crop) */}
                      {isCropExpanded && (
                        <div style={{ padding: '8px 16px' }}>
                          {Object.values(crop.phases).sort((a, b) => a.phase_name.localeCompare(b.phase_name)).map(phase => {
                            const phaseKey = `${crop.crop_name}|${phase.phase_name}`
                            const isPhaseExpanded = !!expandedPhases[phaseKey] // Closed by default
                            
                            // Calculate dynamic verification stats for the sub-phase (env_conditions + manual verify = verified)
                            const phaseTotalCount = phase.subStages.length
                            const phaseVerifiedCount = phase.subStages.filter(s => !!(s.env_conditions && Object.keys(s.env_conditions).length > 0) && verifiedUids.includes(s.uid)).length
                            const isPhaseFullyVerified = phaseVerifiedCount === phaseTotalCount && phaseTotalCount > 0

                            return (
                              <div key={phase.phase_name} style={{ margin: '8px 0', borderLeft: '2px solid var(--border)', paddingLeft: 16 }}>
                                
                                {/* Phase Header Row */}
                                <div 
                                  onClick={() => togglePhase(crop.crop_name, phase.phase_name)}
                                  style={{ 
                                    padding: '8px 12px', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    background: '#f3f4f6'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-secondary)', transform: isPhaseExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                      chevron_right
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      {phase.phase_name}
                                      {isPhaseFullyVerified ? (
                                        <span style={{ fontSize: 10, color: '#16a34a', background: '#eafaf1', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                          ✓ Verified
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: 10, color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                          {phaseVerifiedCount}/{phaseTotalCount} Verified
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: 11, background: '#e5e7eb', color: '#4b5563', padding: '2px 8px', borderRadius: '100px', fontWeight: 600 }}>
                                    {phase.subStages.length} stages
                                  </span>
                                </div>

                                {/* Tier 3: Sub Stages (indented further) */}
                                {isPhaseExpanded && (
                                  <div style={{ padding: '8px 0 8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {phase.subStages.map(stage => {
                                      const isEnvGenerated = !!(stage.env_conditions && Object.keys(stage.env_conditions).length > 0)
                                      const isVerified = isEnvGenerated && verifiedUids.includes(stage.uid)
                                      
                                      return (
                                        <div
                                          key={stage.uid}
                                          onClick={() => navigate(`/reports/${stage.uid}`)}
                                          style={{
                                            padding: '12px 16px',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                          }}
                                          className="sub-stage-row-interactive"
                                        >
                                          <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                              {stage.sub_stage_name}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                              Day {stage.start_day}–{stage.end_day}
                                            </div>
                                          </div>
                                          
                                          {/* Status Marker Badge */}
                                          <div>
                                            {isVerified ? (
                                              <span className="badge" style={{ color: '#16a34a', background: '#eafaf1', border: '1px solid #bbf7d0', fontWeight: 700 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>verified</span> Verified
                                              </span>
                                            ) : isEnvGenerated ? (
                                              <span className="badge" style={{ color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', fontWeight: 600 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>pending</span> Env Generated - Not Verified
                                              </span>
                                            ) : stage.data_source === 'llm' ? (
                                              <span className="badge" style={{ color: '#c2410c', background: '#fff7ed', border: '1px solid #ffedd5', fontWeight: 600 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>hourglass_empty</span> Env Not Yet Generated
                                              </span>
                                            ) : (
                                              <span className="badge" style={{ color: '#c2410c', background: '#fff7ed', border: '1px solid #ffedd5', fontWeight: 600 }}>
                                                Yet to be reviewed
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Add Crop Modal ──────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            position: 'relative'
          }}>
            {/* Modal Close Button */}
            {!isGenerating && (
              <button 
                onClick={closeAddModal}
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}

            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', fontFamily: 'Playfair Display, serif' }}>
              Add New Crop
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: '1.5' }}>
              Generate a complete agronomist-verified advisory report with standard growth phases and sub-stages using Gemini LLM.
            </p>

            {generateError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: 13,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                <span>{generateError}</span>
              </div>
            )}

            {isGenerating ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', textAlign: 'center' }}>
                <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, borderTopColor: '#000', borderRadius: '50%', borderStyle: 'solid', animation: 'spin 1s linear infinite' }} />
                <div style={{ marginTop: 18, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Synthesizing complete crop advisory...
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Generating pest, disease & environmental data for all growth stages of "{newCropName}". This takes ~30–60 seconds.
                </div>
              </div>
            ) : (
              <form onSubmit={handleGenerateCrop}>
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="crop-name-input" style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Crop Name
                  </label>
                  <input
                    id="crop-name-input"
                    type="text"
                    placeholder="e.g. Ragi, Pearl Millet, Mustard..."
                    value={newCropName}
                    onChange={e => setNewCropName(e.target.value)}
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: 14,
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'border-color 0.15s'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    className="btn-cancel"
                    style={{
                      padding: '10px 18px',
                      background: 'none',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-generate"
                    style={{
                      padding: '10px 20px',
                      background: '#000000',
                      border: '1px solid #000000',
                      borderRadius: '6px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    Generate Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Crop Modal (Re-authentication required) ─────────────────────────────────── */}
      {isDeleteModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            position: 'relative'
          }}>
            {/* Modal Close Button */}
            {!isDeleting && (
              <button 
                onClick={closeDeleteModal}
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}

            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ Delete Crop: {cropToDelete}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: '1.5' }}>
              <strong>Warning:</strong> This will permanently delete the crop <strong>"{cropToDelete}"</strong> and all of its associated growth stages/recommendations from the database. <strong>This action cannot be undone.</strong>
            </p>

            {deleteError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: 13,
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                <span>{deleteError}</span>
              </div>
            )}

            {isDeleting ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', textAlign: 'center' }}>
                <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, borderTopColor: '#dc2626', borderRadius: '50%', borderStyle: 'solid', animation: 'spin 1s linear infinite' }} />
                <div style={{ marginTop: 18, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Deleting crop & purging all stages…
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Removing "{cropToDelete}" from database permanently.
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmDelete}>
                <div style={{ marginBottom: 24 }}>
                  <label htmlFor="admin-key-input" style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Enter Admin Key to Unlock Deletion
                  </label>
                  <input
                    id="admin-key-input"
                    type="password"
                    placeholder="Enter your VITE_ADMIN_KEY password…"
                    value={confirmAdminKey}
                    onChange={e => setConfirmAdminKey(e.target.value)}
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: 14,
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'border-color 0.15s'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    className="btn-cancel"
                    style={{
                      padding: '10px 18px',
                      background: 'none',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      background: '#dc2626',
                      border: '1px solid #dc2626',
                      borderRadius: '6px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                  >
                    Confirm Delete
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        .sub-stage-row-interactive:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-color: var(--primary) !important;
        }
        .filter-option {
          user-select: none;
        }
        .btn-add-crop {
          background: transparent;
          border: 1px solid #000000;
          color: #000000;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease-in-out;
          font-family: inherit;
        }
        .btn-add-crop:hover {
          background: #000000;
          color: #ffffff;
        }
        .btn-generate:hover {
          background: #222222 !important;
          border-color: #222222 !important;
        }
        .btn-cancel:hover {
          color: var(--text-primary) !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
