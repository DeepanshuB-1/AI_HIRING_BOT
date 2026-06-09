import axios from 'axios'

const api = axios.create({ baseURL: '' }) // proxied via vite to localhost:8000

// Attach HR token on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('hr_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Separate instance for candidate portal — uses candidate_token, NOT hr_token
const portalApi = axios.create({ baseURL: '' })
portalApi.interceptors.request.use(config => {
  const token = localStorage.getItem('candidate_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const getJobs = () => api.get('/hr/jobs').then(r => r.data)
export const getJob = (id) => api.get(`/hr/jobs/${id}`).then(r => r.data)
export const createJob = (payload) => api.post('/hr/jobs', payload).then(r => r.data)
export const updateJob = (id, payload) => api.patch(`/hr/jobs/${id}`, payload).then(r => r.data)
export const toggleJobActive = (id, is_active) => api.patch(`/hr/jobs/${id}`, { is_active }).then(r => r.data)

// ── Candidates ────────────────────────────────────────────────────────────────
export const getCandidates = (params = {}) =>
  api.get('/hr/candidates', { params }).then(r => r.data)

export const getCandidate = (id) =>
  api.get(`/hr/candidates/${id}`).then(r => r.data)

export const getCandidateReport = (id) =>
  api.get(`/hr/candidates/${id}/report`).then(r => r.data)

export const deleteCandidate = (id) =>
  api.delete(`/hr/candidates/${id}`)

export const submitDecision = (id, decision, notes = '') =>
  api.post(`/hr/candidates/${id}/decision`, { decision, notes }).then(r => r.data)

export const retriggerPipeline = (id) =>
  api.post(`/hr/candidates/${id}/retrigger`).then(r => r.data)

export const bulkReject = (ids) =>
  api.post('/hr/candidates/bulk-reject', ids).then(r => r.data)

export const uploadCandidate = (formData) =>
  api.post('/hr/candidates/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)

export const semanticSearch = (query, limit = 10) =>
  api.get('/hr/candidates/semantic-search', { params: { query, limit } }).then(r => r.data)

export const exportCandidatesCSV = (jobId) =>
  api.get('/hr/candidates/export', { params: { job_id: jobId }, responseType: 'blob' }).then(r => {
    const disposition = r.headers['content-disposition'] || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : 'candidates.csv'
    const url = window.URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    window.URL.revokeObjectURL(url)
  })

// ── Schedule ──────────────────────────────────────────────────────────────────
export const getSchedule = (date) =>
  api.get('/hr/schedule', { params: date ? { date_str: date } : {} }).then(r => r.data)

// ── Voice ─────────────────────────────────────────────────────────────────────
export const initiateCall = (candidateId) =>
  api.post(`/voice/initiate/${candidateId}`).then(r => r.data)

// ── Health ────────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health').then(r => r.data)
export const getAnalytics = () => api.get('/hr/analytics').then(r => r.data)

// ── Candidate Portal ──────────────────────────────────────────────────────────
// Public (no auth needed)
export const portalGetJobs = () => portalApi.get('/api/portal/jobs').then(r => r.data)
export const portalGetJob = (id) => portalApi.get(`/api/portal/jobs/${id}`).then(r => r.data)
export const portalRegister = (payload) => portalApi.post('/api/portal/auth/register', payload).then(r => r.data)
export const portalLogin = (payload) => portalApi.post('/api/portal/auth/login', payload).then(r => r.data)
// Authenticated (sends candidate_token)
export const portalMe = () => portalApi.get('/api/portal/auth/me').then(r => r.data)
export const portalApply = (jobId, formData) =>
  portalApi.post(`/api/portal/apply/${jobId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
export const portalMyApplications = () => portalApi.get('/api/portal/my-applications').then(r => r.data)
export const portalWithdraw = (candidateId) => portalApi.delete(`/api/portal/apply/${candidateId}`).then(r => r.data)
