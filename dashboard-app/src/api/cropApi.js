import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({ baseURL: BASE })

// ── Dashboard Stats ──────────────────────────────────────────────────────────
export const fetchStats = () => api.get('/api/stats').then(r => r.data)

// ── Crop Stage Knowledge ─────────────────────────────────────────────────────
export const fetchReports = (params = {}) =>
  api.get('/api/crop-knowledge', { params }).then(r => r.data)

export const fetchReportByUid = (uid) =>
  api.get(`/api/crop-knowledge/${uid}`).then(r => r.data)

export const saveReport = (uid, data) =>
  api.put(`/api/crop-knowledge/${uid}`, data).then(r => r.data)

// ── Regenerate (calls Gemini) ────────────────────────────────────────────────
export const regenerateReport = (uid) =>
  api.post(`/api/crop-knowledge/${uid}/regenerate`).then(r => r.data)

// ── Generate Env Conditions (on-demand) ──────────────────────────────────────
export const generateEnvConditions = (uid) =>
  api.post(`/api/crop-knowledge/${uid}/generate-env`).then(r => r.data)

// ── Translations ─────────────────────────────────────────────────────────────
export const fetchTranslation = (uid, lang = 'kn') =>
  api.get(`/api/translations/${uid}`, { params: { lang } }).then(r => r.data)

export const saveTranslation = (uid, lang, data) =>
  api.put(`/api/translations/${uid}`, { lang, ...data }).then(r => r.data)

// ── Admin: all crops, all translations status ────────────────────────────────
export const fetchAllCrops = () =>
  api.get('/api/admin/crops').then(r => r.data)

export const fetchTranslationStatus = () =>
  api.get('/api/admin/translation-status').then(r => r.data)

export const deleteCrop = (cropName) =>
  api.delete(`/api/admin/crops/${cropName}`).then(r => r.data)

// ── Add Crop (Full Generation) ───────────────────────────────────────────────
export const generateCropReport = (cropName) =>
  api.post('/api/crop-knowledge/generate', { crop_name: cropName }).then(r => r.data)

