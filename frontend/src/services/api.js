import axios from 'axios'

// ── API base URL ─────────────────────────────────────────────────────────────
// Default is the same-origin path '/api':
//   • dev:        Vite proxies /api  -> http://localhost:5000   (vite.config.js)
//   • production: Vercel rewrites /api/* -> your Railway backend (vercel.json)
// To call the backend directly instead (no proxy), set VITE_API_URL at BUILD time
// (e.g. https://your-app.up.railway.app). The backend must then allow the origin
// in CORS_ORIGINS. A trailing slash or a trailing "/api" is tolerated.
const RAW_API = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/, '')
export const API_ORIGIN = RAW_API
const BASE = `${RAW_API}/api`

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// AuthContext sets api.defaults.headers.common['Authorization'] when the
// token changes — so the interceptor no longer needs to read localStorage
// on every single request (that was a synchronous disk-read per call).
// We only fall back to localStorage here as a safety net for requests that
// fire before AuthContext has run (extremely rare — practically never happens).
api.interceptors.request.use((config) => {
  if (!config.headers['Authorization']) {
    const token = localStorage.getItem('auth_token')
    if (token) config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'An unexpected error occurred'
    const wrapped = new Error(message)
    // Preserve structured error fields (status, error_code, etc.) for callers that
    // need more than the message string — existing `.message`-only usages are unaffected.
    wrapped.status = err.response?.status
    wrapped.data = err.response?.data
    return Promise.reject(wrapped)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────
export const loginUser = (email, password) => api.post('/auth/login', { email, password })
export const logoutUser = () => api.post('/auth/logout')
export const getMe = () => api.get('/auth/me')

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboard = () => api.get('/dashboard')

// ── Tenders ───────────────────────────────────────────────────
export const getTenders = () => api.get('/tenders')
export const getTender = (id) => api.get(`/tenders/${id}`)
export const getTenderRequirements = (id) => api.get(`/tenders/${id}/requirements`)
export const getTenderBidders = (id) => api.get(`/tenders/${id}/bidders`)
export const createTender = (data) => api.post('/tenders', data)
export const issueCorrigendum = (tenderId, data) => api.post(`/tenders/${tenderId}/corrigendum`, data)

// ── Bidders ───────────────────────────────────────────────────
export const getBidder = (id) => api.get(`/bidders/${id}`)
export const getBidderDocuments = (id) => api.get(`/bidders/${id}/documents`)
export const getBidderCompliance = (id) => api.get(`/bidders/${id}/compliance`)
export const analyzeBidder = (id) => api.post(`/bidders/${id}/analyze`)
export const getBidderReport = (id) => api.get(`/bidders/${id}/report`)
export const submitOfficerDecision = (id, data) => api.post(`/bidders/${id}/decision`, data)
export const createBidder = (data) => api.post('/bidders', data)
export const deleteBidder = (id, officer) => api.delete(`/bidders/${id}`, { data: { officer } })

// ── Documents ─────────────────────────────────────────────────
export const uploadDocuments = (bidderId, files, tenderId = null, requirementId = null) => {
  const formData = new FormData()
  formData.append('bidder_id', bidderId)
  if (tenderId)      formData.append('tender_id', tenderId)
  if (requirementId) formData.append('requirement_id', requirementId)
  files.forEach((f) => formData.append('files', f))
  return api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const getDocument = (id) => api.get(`/documents/${id}`)
export const deleteDocument = (id) => api.delete(`/documents/${id}`)
export const reprocessDocument = (id) => api.post(`/documents/${id}/reprocess`)
export const checkDuplicateDocument = (bidderId, docType, requirementId = '') =>
  api.get(`/documents/check-duplicate`, { params: { bidder_id: bidderId, doc_type: docType, requirement_id: requirementId } })
// These return raw file URLs — used directly in <iframe> / <img> / window.open
export const getDocumentViewUrl = (id) => `${BASE}/documents/${id}/view`
export const getDocumentDownloadUrl = (id) => `${BASE}/documents/${id}/download`
export const getBidderTamperingSummary = (bidderId) => api.get(`/bidders/${bidderId}/tampering`)

// ── Audit ─────────────────────────────────────────────────────
export const getAuditTrail = (params = {}) => api.get('/audit', { params })

// ── Contracts ─────────────────────────────────────────────────
export const getContracts = (params = {}) => api.get('/contracts', { params })
export const getContract = (id) => api.get(`/contracts/${id}`)
export const createContract = (data) => api.post('/contracts', data)
export const updateMilestone = (contractId, data) => api.put(`/contracts/${contractId}/milestone`, data)
export const getContractInspections = (contractId) => api.get(`/contracts/${contractId}/inspections`)

// ── Inspections ───────────────────────────────────────────────
export const createInspection = (data) => api.post('/inspections', data)
export const updateInspection = (id, data) => api.put(`/inspections/${id}`, data)

// ── Corrective Actions ────────────────────────────────────────
export const getCorrectiveActions = (params = {}) => api.get('/corrective-actions', { params })
export const createCorrectiveAction = (data) => api.post('/corrective-actions', data)
export const resolveCorrectiveAction = (id, data) => api.post(`/corrective-actions/${id}/resolve`, data)

// ── Vendor Profiles ───────────────────────────────────────────
export const getVendorProfiles = () => api.get('/vendor-profiles')
export const getVendorProfile = (bidderId) => api.get(`/vendor-profiles/${bidderId}`)
export const getPublicVendorProfile = (gstin) => api.get(`/public/vendor-profiles/${gstin}`)

// ── Verification ──────────────────────────────────────────────
export const getVerificationAdapters = () => api.get('/verification/adapters')
export const runVerification = (data) => api.post('/verification/verify', data)
export const verifyBidder = (id) => api.get(`/verification/bidder/${id}`)
export const verifyGSTN = (gstin, name) => api.get(`/verification/gstn/${gstin}`, { params: { name } })

// ── Evaluation Tasks ──────────────────────────────────────────
export const getEvaluationTasks = (params = {}) => api.get('/evaluation/tasks', { params })
export const createEvaluationTask = (data) => api.post('/evaluation/tasks', data)
export const updateEvaluationTask = (id, data) => api.put(`/evaluation/tasks/${id}`, data)

// ── Clarifications ────────────────────────────────────────────
export const getOfficerClarifications = (params = {}) => api.get('/officer/clarifications', { params })
export const createClarification = (data) => api.post('/officer/clarifications', data)
export const resolveClarification = (id, data) => api.post(`/officer/clarifications/${id}/resolve`, data)
export const getBidderClarifications = () => api.get('/bidder/clarifications')
export const respondToClarification = (id, data) => api.post(`/bidder/clarifications/${id}/respond`, data)

// ── Bids ──────────────────────────────────────────────────────
export const getOfficerBids = (params = {}) => api.get('/officer/bids', { params })
export const getBidderBids = () => api.get('/bidder/bids')
export const submitBid = (data) => api.post('/bidder/submit-bid', data)
export const getBidderDashboard = () => api.get('/bidder/dashboard')
export const getBidderTenders = (params = {}) => api.get('/bidder/tenders', { params })
export const getBidReadiness = () => api.get('/bidder/readiness')
export const advanceBidStage = (bidId, data) => api.post(`/officer/bids/${bidId}/advance-stage`, data)
export const openFinancialBids = (tenderId) => api.post(`/officer/bids/open-financial?tender_id=${tenderId}`)

// ── Tender lifecycle ──────────────────────────────────────────
export const extendDeadline = (tenderId, data) => api.post(`/tenders/${tenderId}/extend`, data)
export const cancelTender = (tenderId, data) => api.post(`/tenders/${tenderId}/cancel`, data)
export const reTender = (tenderId, data) => api.post(`/tenders/${tenderId}/re-tender`, data)

// ── Pre-bid meeting ───────────────────────────────────────────
export const getPreBid = (tenderId) => api.get(`/tenders/${tenderId}/prebid`)
export const schedulePreBid = (tenderId, data) => api.post(`/tenders/${tenderId}/prebid/schedule`, data)
export const submitPreBidQuestion = (tenderId, data) => api.post(`/tenders/${tenderId}/prebid/questions`, data)
export const answerPreBidQuestion = (tenderId, qId, data) => api.post(`/tenders/${tenderId}/prebid/questions/${qId}/answer`, data)
export const acknowledgeCorrigendum = (tenderId, num) => api.post(`/tenders/${tenderId}/corrigendum/${num}/acknowledge`)

// ── Bid lifecycle ─────────────────────────────────────────────
export const withdrawBid = (bidId, data) => api.post(`/bids/${bidId}/withdraw`, data)
export const modifyBid = (bidId, data) => api.post(`/bids/${bidId}/modify`, data)
export const getBidVersions = (bidId) => api.get(`/bids/${bidId}/versions`)

// ── EMD & verifications ───────────────────────────────────────
export const verifyEMD = (bidId, data) => api.post(`/bids/${bidId}/emd/verify`, data)
export const runPriceAnalysis = (bidId) => api.post(`/bids/${bidId}/price-analysis`)
export const verifyPreference = (bidId, data) => api.post(`/bids/${bidId}/preference/verify`, data)
export const verifyLocalContent = (bidId, data) => api.post(`/bids/${bidId}/local-content/verify`, data)
export const verifyOEM = (bidId, data) => api.post(`/bids/${bidId}/oem/verify`, data)

// ── AI override ───────────────────────────────────────────────
export const submitAIOverride = (entityType, entityId, data) => api.post(`/ai/${entityType}/${entityId}/override`, data)

// ── Technical committee ───────────────────────────────────────
export const getCommittee = (tenderId) => api.get(`/tenders/${tenderId}/committee`)
export const formCommittee = (tenderId, data) => api.post(`/tenders/${tenderId}/committee`, data)
export const submitCommitteeScore = (tenderId, data) => api.post(`/tenders/${tenderId}/committee/score`, data)

// ── Vendor integrity ──────────────────────────────────────────
export const getVendorIntegrity = (bidderId) => api.get(`/vendors/${bidderId}/integrity`)
export const submitConflictDeclaration = (tenderId, data) => api.post(`/tenders/${tenderId}/conflict-declaration`, data)

// ── Notifications ─────────────────────────────────────────────
export const getNotifications = () => api.get('/notifications')
export const markNotificationsRead = (ids = []) => api.post('/notifications/read', { ids })

// ── Global search ─────────────────────────────────────────────
export const globalSearch = (q) => api.get('/search', { params: { q } })

// ── Grievances ────────────────────────────────────────────────
export const submitGrievance = (data) => api.post('/grievances', data)
export const getGrievances = (params = {}) => api.get('/grievances', { params })
export const getBidderGrievances = () => api.get('/bidder/grievances')
export const assignGrievance = (id, data) => api.post(`/grievances/${id}/assign`, data)
export const respondToGrievance = (id, data) => api.post(`/grievances/${id}/respond`, data)
export const getPublicGrievanceStats = (tenderId) => api.get('/public/grievances/stats', { params: { tender_id: tenderId } })

// ── Public Portal ─────────────────────────────────────────────
export const getPublicDashboard = () => api.get('/public/dashboard')
export const getPublicTenders = (params = {}) => api.get('/public/tenders', { params })
export const getPublicTenderTimeline = (id) => api.get(`/public/tenders/${id}/timeline`)
export const submitPublicFeedback = (tenderId, data) => api.post(`/public/tenders/${tenderId}/feedback`, data)
export const getPublicFeedback = () => api.get('/public/feedback')

// ── Officer Feedback ──────────────────────────────────────────
export const getOfficerFeedback = (params = {}) => api.get('/officer/feedback', { params })
export const respondToFeedback = (id, data) => api.post(`/officer/feedback/${id}/respond`, data)

// ── Rejection Feedback ────────────────────────────────────────
export const getRejectionFeedback = (params = {}) => api.get('/rejection-feedback', { params })
export const sendRejectionFeedback = (fbId, data) => api.post(`/rejection-feedback/${fbId}/send`, data)
export const getBidderRejectionFeedback = (bidderId) =>
  api.get('/bidder/rejection-feedback', { params: { bidder_id: bidderId } })

// ── Leaderboard ───────────────────────────────────────────────
export const getTenderLeaderboard = (tenderId) => api.get(`/officer/tenders/${tenderId}/leaderboard`)

// ── Officer Summary ───────────────────────────────────────────
export const getOfficerSummary = (tenderId) => api.get(`/officer/tenders/${tenderId}/summary`)
// NOTE: relative to the axios baseURL ('/api') — must NOT start with /api again
export const getOfficerSummaryReportUrl = (tenderId) => `/officer/tenders/${tenderId}/summary/report`

// ── Authenticated file download ───────────────────────────────────────────────
// A plain <a href> cannot send the Authorization header, so protected files
// (e.g. the Excel summary) came back 401. Fetch as a blob with the token instead.
export async function downloadFile(path, filename) {
  const res = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
}
