import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'

// ── Layouts (always needed — keep static) ─────────────────────
import Sidebar from './components/Sidebar.jsx'
import BidderSidebar from './components/BidderSidebar.jsx'
import StakeholderSidebar from './components/StakeholderSidebar.jsx'
import TopBar from './components/TopBar.jsx'
import { PageLoader, RouteLoader } from './components/LoadingSkeleton.jsx'
import ChatBot from './components/ChatBot.jsx'

// ── Auth (always needed — keep static) ───────────────────────
import Login from './pages/Login.jsx'

// ── Officer pages — lazy loaded ───────────────────────────────
const Dashboard          = lazy(() => import('./pages/Dashboard.jsx'))
const Tenders            = lazy(() => import('./pages/Tenders.jsx'))
const TenderDetail       = lazy(() => import('./pages/TenderDetail.jsx'))
const Requirements       = lazy(() => import('./pages/Requirements.jsx'))
const Bidders            = lazy(() => import('./pages/Bidders.jsx'))
const BidderDetail       = lazy(() => import('./pages/BidderDetail.jsx'))
const Documents          = lazy(() => import('./pages/Documents.jsx'))
const CompliancePage     = lazy(() => import('./pages/CompliancePage.jsx'))
const AIRecommendation   = lazy(() => import('./pages/AIRecommendation.jsx'))
const OfficerDecision    = lazy(() => import('./pages/OfficerDecision.jsx'))
const Reports            = lazy(() => import('./pages/Reports.jsx'))
const AuditTrail         = lazy(() => import('./pages/AuditTrail.jsx'))
const Alerts             = lazy(() => import('./pages/Alerts.jsx'))
const Settings           = lazy(() => import('./pages/Settings.jsx'))
const EvaluationTasks    = lazy(() => import('./pages/officer/EvaluationTasks.jsx'))
const FeedbackCenter     = lazy(() => import('./pages/officer/FeedbackCenter.jsx'))
const ContractManagement = lazy(() => import('./pages/officer/ContractManagement.jsx'))
const VendorProfile      = lazy(() => import('./pages/officer/VendorProfile.jsx'))
const CreateTender       = lazy(() => import('./pages/officer/CreateTender.jsx'))
const GovVerification    = lazy(() => import('./pages/officer/GovVerification.jsx'))
const BidComparison      = lazy(() => import('./pages/officer/BidComparison.jsx'))
const QualityInspections = lazy(() => import('./pages/officer/QualityInspections.jsx'))
const EvalCommittee      = lazy(() => import('./pages/officer/EvalCommittee.jsx'))
const GrievanceCenter    = lazy(() => import('./pages/officer/GrievanceCenter.jsx'))
const ReverseAuction     = lazy(() => import('./pages/officer/ReverseAuction.jsx'))
const PreBidMeeting      = lazy(() => import('./pages/officer/PreBidMeeting.jsx'))
const OfficerSummary     = lazy(() => import('./pages/officer/OfficerSummary.jsx'))
const RejectionFeedbackDashboard = lazy(() => import('./pages/officer/RejectionFeedbackDashboard.jsx'))

// ── Bidder pages — lazy loaded ────────────────────────────────
const BidderDashboard    = lazy(() => import('./pages/bidder/BidderDashboard.jsx'))
const BidderTenders      = lazy(() => import('./pages/bidder/BidderTenders.jsx'))
const BidReadiness       = lazy(() => import('./pages/bidder/BidReadiness.jsx'))
const BidderClarifications = lazy(() => import('./pages/bidder/BidderClarifications.jsx'))
const BidSubmit          = lazy(() => import('./pages/bidder/BidSubmit.jsx'))
const BidderBids         = lazy(() => import('./pages/bidder/BidderBids.jsx'))
const BidderRegister     = lazy(() => import('./pages/bidder/BidderRegister.jsx'))
const BidderGrievances   = lazy(() => import('./pages/bidder/BidderGrievances.jsx'))

// ── Stakeholder pages — lazy loaded ──────────────────────────
const PublicDashboard    = lazy(() => import('./pages/stakeholder/PublicDashboard.jsx'))
const PublicTenderTimeline = lazy(() => import('./pages/stakeholder/PublicTenderTimeline.jsx'))
const PublicFeedback     = lazy(() => import('./pages/stakeholder/PublicFeedback.jsx'))
const PublicTenderDetail = lazy(() => import('./pages/stakeholder/PublicTenderDetail.jsx'))
const TrustCentre        = lazy(() => import('./pages/stakeholder/TrustCentre.jsx'))
const ProcurementGlossary = lazy(() => import('./pages/stakeholder/ProcurementGlossary.jsx'))

// ── Role-scoped Suspense wrapper — shows a content skeleton while the lazy chunk loads
function PageSuspense({ children }) {
  return (
    <Suspense fallback={<RouteLoader />}>
      {children}
    </Suspense>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />

  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // ── OFFICER ───────────────────────────────────────────────
  if (user.role === 'OFFICER') {
    return (
      <>
        <TopBar />
        <div className="flex h-screen overflow-hidden pt-[57px]" style={{ background: 'var(--bg-page)' }}>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <PageSuspense>
              <Routes>
                <Route path="/" element={<Dashboard />} />

                {/* Tenders */}
                <Route path="/tenders" element={<Tenders />} />
                <Route path="/tenders/new" element={<CreateTender />} />
                <Route path="/tenders/:tenderId" element={<TenderDetail />} />
                <Route path="/tenders/:tenderId/requirements" element={<Requirements />} />
                <Route path="/tenders/:tenderId/bidders" element={<Bidders />} />

                {/* Bidders */}
                <Route path="/bidders" element={<Bidders />} />
                <Route path="/bidders/:bidderId" element={<BidderDetail />} />
                <Route path="/bidders/:bidderId/compliance" element={<CompliancePage />} />
                <Route path="/bidders/:bidderId/recommendation" element={<AIRecommendation />} />
                <Route path="/bidders/:bidderId/decision" element={<OfficerDecision />} />

                {/* Documents */}
                <Route path="/documents" element={<Documents />} />

                {/* Operations */}
                <Route path="/tasks" element={<EvaluationTasks />} />
                <Route path="/contracts" element={<ContractManagement />} />
                <Route path="/gov-verification" element={<GovVerification />} />
                <Route path="/bid-comparison" element={<BidComparison />} />
                <Route path="/tenders/:tenderId/bid-comparison" element={<BidComparison />} />
                <Route path="/vendor-profiles/:bidderId" element={<VendorProfile />} />
                <Route path="/bidders/:bidderId/vendor-profile" element={<VendorProfile />} />
                <Route path="/quality/inspections" element={<QualityInspections />} />
                <Route path="/tenders/:tenderId/committee" element={<EvalCommittee />} />
                <Route path="/tenders/:tenderId/reverse-auction" element={<ReverseAuction />} />
                <Route path="/tenders/:tenderId/prebid" element={<PreBidMeeting />} />
                <Route path="/grievances" element={<GrievanceCenter />} />

                {/* Reports & Monitoring */}
                <Route path="/officer-summary" element={<OfficerSummary />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/audit" element={<AuditTrail />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/feedback" element={<FeedbackCenter />} />
                <Route path="/rejection-feedback" element={<RejectionFeedbackDashboard />} />
                <Route path="/settings" element={<Settings />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageSuspense>
          </main>
        </div>
        <ChatBot />
      </>
    )
  }

  // ── BIDDER ────────────────────────────────────────────────
  if (user.role === 'BIDDER') {
    return (
      <>
        <TopBar />
        <div className="flex h-screen overflow-hidden pt-[57px]" style={{ background: 'var(--bg-page)' }}>
          <BidderSidebar />
          <main className="flex-1 overflow-y-auto">
            <PageSuspense>
              <Routes>
                <Route path="/bidder/dashboard" element={<BidderDashboard />} />
                <Route path="/bidder/tenders" element={<BidderTenders />} />
                <Route path="/bidder/readiness" element={<BidReadiness />} />
                <Route path="/bidder/bids" element={<BidderBids />} />
                <Route path="/bidder/clarifications" element={<BidderClarifications />} />
                <Route path="/bidder/submit-bid" element={<BidSubmit />} />
                <Route path="/bidder/submit-bid/:bidId" element={<BidSubmit />} />
                <Route path="/bidder/register" element={<BidderRegister />} />
                <Route path="/bidder/documents" element={<Documents />} />
                <Route path="/bidder/grievances" element={<BidderGrievances />} />
                <Route path="*" element={<Navigate to="/bidder/dashboard" replace />} />
              </Routes>
            </PageSuspense>
          </main>
        </div>
        <ChatBot />
      </>
    )
  }

  // ── STAKEHOLDER ───────────────────────────────────────────
  if (user.role === 'STAKEHOLDER') {
    return (
      <>
        <TopBar />
        <div className="flex h-screen overflow-hidden pt-[57px]" style={{ background: 'var(--bg-page)' }}>
          <StakeholderSidebar />
          <main className="flex-1 overflow-y-auto">
            <PageSuspense>
              <Routes>
                <Route path="/public/dashboard" element={<PublicDashboard />} />
                <Route path="/public/tenders" element={<PublicDashboard />} />
                <Route path="/public/tenders/:tenderId" element={<PublicTenderDetail />} />
                <Route path="/public/tenders/:tenderId/timeline" element={<PublicTenderTimeline />} />
                <Route path="/public/tenders/:tenderId/feedback" element={<PublicFeedback />} />
                <Route path="/public/feedback" element={<PublicFeedback />} />
                <Route path="/public/trust-centre" element={<TrustCentre />} />
                <Route path="/public/glossary" element={<ProcurementGlossary />} />
                <Route path="*" element={<Navigate to="/public/dashboard" replace />} />
              </Routes>
            </PageSuspense>
          </main>
        </div>
        <ChatBot />
      </>
    )
  }

  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  )
}
