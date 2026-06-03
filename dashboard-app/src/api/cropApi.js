import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({ baseURL: BASE })

// Helper: returns headers with admin key for mutating endpoints
const adminHeaders = () => ({
  'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY || '',
})

// ── Dashboard Stats (public) ─────────────────────────────────────────────────
export const fetchStats = () => api.get('/api/stats').then(r => r.data)

// ── Crop Stage Knowledge (public reads) ──────────────────────────────────────
export const fetchReports = (params = {}) =>
  api.get('/api/crop-knowledge', { params }).then(r => r.data)

export const fetchReportByUid = (uid) =>
  api.get(`/api/crop-knowledge/${uid}`).then(r => r.data)

// ── Save revision (admin key required) ───────────────────────────────────────
export const saveReport = (uid, data) =>
  api.put(`/api/crop-knowledge/${uid}`, data, { headers: adminHeaders() }).then(r => r.data)

// ── Regenerate via Gemini (admin key required) ────────────────────────────────
export const regenerateReport = (uid) =>
  api.post(`/api/crop-knowledge/${uid}/regenerate`, {}, { headers: adminHeaders() }).then(r => r.data)

// ── Generate Env Conditions (admin key required) ──────────────────────────────
export const generateEnvConditions = (uid) =>
  api.post(`/api/crop-knowledge/${uid}/generate-env`, {}, { headers: adminHeaders() }).then(r => r.data)

// ── Translations (public reads) ───────────────────────────────────────────────
export const fetchTranslation = (uid, lang = 'kn') =>
  api.get(`/api/translations/${uid}`, { params: { lang } }).then(r => r.data)

export const saveTranslation = (uid, lang, data) =>
  api.put(`/api/translations/${uid}`, { lang, ...data }).then(r => r.data)

// ── Admin: read-only (public) ─────────────────────────────────────────────────
export const fetchAllCrops = () =>
  api.get('/api/admin/crops').then(r => r.data)

export const fetchTranslationStatus = () =>
  api.get('/api/admin/translation-status').then(r => r.data)

// ── Admin: mutating (admin key required) ─────────────────────────────────────
export const deleteCrop = (cropName) =>
  api.delete(`/api/admin/crops/${cropName}`, { headers: adminHeaders() }).then(r => r.data)

export const generateCropReport = (cropName) =>
  api.post('/api/crop-knowledge/generate', { crop_name: cropName }, { headers: adminHeaders() }).then(r => r.data)

export const regenEmpty = () =>
  api.post('/api/admin/regen-empty', {}, { headers: adminHeaders() }).then(r => r.data)
