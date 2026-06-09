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

export const uploadCandidate = (formData) =>
  api.post('/hr/candidates/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)

export const semanticSearch = (query, limit = 10) =>
  api.get('/hr/candidates/semantic-search', { params: { query, limit } }).then(r => r.data)

// ── Schedule ──────────────────────────────────────────────────────────────────
export const getSchedule = (date) =>
  api.get('/hr/schedule', { params: date ? { date_str: date } : {} }).then(r => r.data)

// ── Voice ─────────────────────────────────────────────────────────────────────
export const initiateCall = (candidateId) =>
  api.post(`/voice/initiate/${candidateId}`).then(r => r.data)

// ── Health ────────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health').then(r => r.data)

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
