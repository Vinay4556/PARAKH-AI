import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Search, X } from 'lucide-react'
import { useLanguage } from '../../context/LanguageContext.jsx'

// ── Glossary data ─────────────────────────────────────────────
const TERMS = [
  // A
  {
    term: 'Award',
    category: 'A',
    short: 'The official decision to grant a contract to a selected bidder.',
    full: 'An award is the procurement officer\'s formal decision to accept a bid and grant the contract to the selected vendor. The award order is published publicly and marks the conclusion of the evaluation process. In PARAKH AI, the officer award is permanently recorded in the audit trail.',
  },
  {
    term: 'Award of Contract',
    category: 'A',
    short: 'Formal acceptance of a bid and issue of a contract order.',
    full: 'After the Procurement Officer approves a qualified bidder\'s bid, an award order is issued. This is a legally binding document that initiates the contract. It includes the contract value, scope, timeline, and terms agreed upon.',
  },
  // B
  {
    term: 'Bid',
    category: 'B',
    short: 'A vendor\'s formal offer to supply goods or services in response to a tender.',
    full: 'A bid (also called a tender offer or proposal) is a vendor\'s response to a published tender. It contains technical documents proving eligibility and a financial offer (price). Bids are sealed until the bid-opening date. In public procurement, bids must be submitted before the submission deadline.',
  },
  {
    term: 'Bid Bond',
    category: 'B',
    short: 'A guarantee that a bidder will honour their bid if selected.',
    full: 'A bid bond (or bid security) is a financial guarantee submitted alongside a bid to ensure the bidder will not withdraw after selection. It is typically a small percentage of the estimated contract value. If the bidder withdraws, the bond may be forfeited. Also see: EMD (Earnest Money Deposit).',
  },
  {
    term: 'Bidder',
    category: 'B',
    short: 'A company or individual who submits a bid in response to a tender.',
    full: 'A bidder is any eligible entity that responds to a tender by submitting a bid. Bidders must be registered on GeM and meet the eligibility criteria published in the tender document. In PARAKH AI, bidder documents are analysed for compliance and risk before the procurement officer makes a decision.',
  },
  // C
  {
    term: 'Compliance',
    category: 'C',
    short: 'Whether a bid meets all the mandatory requirements of a tender.',
    full: 'Compliance in procurement means that a bidder\'s submitted documents and credentials satisfy all mandatory criteria set out in the tender. Non-compliant bids are usually disqualified. PARAKH AI uses AI-assisted document analysis to evaluate compliance, but the final compliance decision is made by the Procurement Officer.',
  },
  {
    term: 'Corrigendum',
    category: 'C',
    short: 'An official amendment or correction to a published tender.',
    full: 'A corrigendum (plural: corrigenda) is an official notice that amends, corrects, or clarifies the original tender document after it has been published. Corrigenda may change eligibility criteria, submission deadlines, technical specifications, or other terms. Bidders must review all corrigenda before submitting their bid. All corrigenda are published publicly.',
  },
  {
    term: 'Contract',
    category: 'C',
    short: 'A legally binding agreement between the procuring authority and a selected vendor.',
    full: 'A contract is the formal agreement that follows an award decision. It binds the procuring authority and the vendor to deliver goods or services at agreed terms, price, quality, and timelines. In PARAKH AI, contracts are tracked through milestones, inspections, and performance records after the award.',
  },
  // D
  {
    term: 'Disqualification',
    category: 'D',
    short: 'The rejection of a bid due to failure to meet mandatory requirements.',
    full: 'A bidder is disqualified when their bid does not meet one or more mandatory eligibility or compliance criteria. Common reasons include missing documents, invalid certifications, financial non-compliance, or evidence of document tampering. Disqualifications must be justified and recorded. In PARAKH AI, the officer must confirm the decision and provide a rationale.',
  },
  // E
  {
    term: 'EMD (Earnest Money Deposit)',
    category: 'E',
    short: 'A refundable security deposit submitted with a bid to show serious intent.',
    full: 'EMD is a monetary deposit required from bidders to demonstrate their serious intent to participate in the procurement. It is refunded to unsuccessful bidders after the award. EMD is forfeited if a successful bidder withdraws or fails to enter a contract. MSMEs and startups may be exempt from EMD under government policy.',
  },
  {
    term: 'Evaluation Committee',
    category: 'E',
    short: 'A group of officials responsible for reviewing and scoring bids.',
    full: 'The evaluation committee is a formally constituted team of procurement officials and subject-matter experts who assess bids against the tender\'s evaluation criteria. Their scores are aggregated to produce a ranking of bids. In PARAKH AI, committee members can record individual scores, and the AI provides supporting analysis.',
  },
  // F
  {
    term: 'Financial Bid',
    category: 'F',
    short: 'The price-related part of a bid, sealed until after technical evaluation.',
    full: 'In a two-envelope procurement system, the financial bid contains the vendor\'s price offer. It is kept sealed until all bids have been technically evaluated. Only technically qualified bidders\' financial bids are opened. This prevents price from influencing the technical evaluation. The lowest financial bid among qualified bidders determines L1.',
  },
  // G
  {
    term: 'GeM (Government e-Marketplace)',
    category: 'G',
    short: 'India\'s official online platform for government procurement.',
    full: 'GeM is the Government e-Marketplace operated by the Ministry of Commerce and Industry, Government of India. It is the mandated portal for all central government procurement of goods and services. PARAKH AI is designed to complement the GeM procurement workflow with AI-assisted compliance and decision support.',
  },
  {
    term: 'Grievance',
    category: 'G',
    short: 'A formal complaint about a procurement process or decision.',
    full: 'A grievance is a formal complaint by a bidder or citizen about a procurement process, a procurement decision, or procedural irregularities. Grievances follow a structured process: submission, acknowledgement, review, and resolution. In PARAKH AI, grievances are tracked and respond to with a public response when appropriate.',
  },
  {
    term: 'GSTIN',
    category: 'G',
    short: 'Goods and Services Tax Identification Number — a unique business registration ID.',
    full: 'GSTIN is a 15-digit alphanumeric number assigned to each GST-registered business in India. It is mandatory for vendors participating in government procurement. PARAKH AI verifies GSTIN against government databases as part of bidder compliance analysis.',
  },
  // L
  {
    term: 'L1 (Lowest Bidder)',
    category: 'L',
    short: 'The technically qualified bidder with the lowest price.',
    full: 'L1 refers to the vendor who has submitted the lowest evaluated price among all technically qualified bidders. In most government procurement, L1 is typically awarded the contract, subject to negotiations and policy conditions. L2, L3, etc. indicate the second, third lowest price respectively.',
  },
  // M
  {
    term: 'MSE / MSME',
    category: 'M',
    short: 'Micro, Small, and Medium Enterprise — businesses with policy-based procurement benefits.',
    full: 'MSMEs are businesses classified by investment and turnover under the MSME Act. The Government of India provides procurement benefits to MSMEs, including exemption from EMD, price preferences, and reserved procurement quotas. PARAKH AI checks Udyam registration as part of bid compliance. MSMEs with a valid Udyam number are eligible for applicable policy benefits.',
  },
  // O
  {
    term: 'Officer Decision',
    category: 'O',
    short: 'The authoritative final decision made by the Procurement Officer after reviewing all evidence.',
    full: 'The Officer Decision is the human-made final decision in the procurement process. After reviewing AI-generated analysis, compliance reports, risk scores, and all submitted evidence, the Procurement Officer decides to Qualify, Disqualify, or Request Clarification. This decision is permanently recorded in the audit trail with a mandatory rationale.',
  },
  // P
  {
    term: 'PAN (Permanent Account Number)',
    category: 'P',
    short: 'A unique 10-character tax identification number issued by the Income Tax Department.',
    full: 'PAN is a unique alphanumeric identifier issued by the Income Tax Department of India to all taxable entities. It is required for financial transactions above specified limits and is verified as part of bidder compliance in government procurement.',
  },
  {
    term: 'Pre-Bid Meeting',
    category: 'P',
    short: 'A meeting held before the bid submission deadline where bidders can ask clarification questions.',
    full: 'A pre-bid meeting (also called a pre-tender conference) is a formal meeting where the procuring authority clarifies doubts about the tender requirements, scope, and evaluation criteria. Bidders may submit written questions before or during the meeting. Official answers are published as corrigenda or addenda and become part of the tender document.',
  },
  {
    term: 'Procurement',
    category: 'P',
    short: 'The process of acquiring goods or services from external vendors.',
    full: 'Procurement is the formal process through which government organisations acquire goods, services, or works from the market. Public procurement in India is governed by the General Financial Rules (GFR), DPIIT policies, and specific sectoral rules. It must be transparent, competitive, fair, and accountable.',
  },
  // Q
  {
    term: 'Qualification',
    category: 'Q',
    short: 'The confirmation that a bidder meets all mandatory requirements to proceed.',
    full: 'A bidder is qualified when the Procurement Officer confirms, after reviewing all compliance evidence, that the bidder satisfies all mandatory eligibility and technical criteria. Qualified bidders proceed to the financial evaluation stage. Qualification is distinct from winning the contract.',
  },
  // R
  {
    term: 'Reverse Auction',
    category: 'R',
    short: 'A price negotiation where qualified vendors compete by progressively lowering their price.',
    full: 'A reverse auction (RA) is a price-discovery mechanism used after technical qualification. Qualified bidders are invited to submit progressively lower price bids in a time-limited online auction. The lowest price at the end of the auction is used as the L1 price. PARAKH AI includes a reverse auction module for eligible tenders.',
  },
  // T
  {
    term: 'Technical Evaluation',
    category: 'T',
    short: 'The assessment of bids against non-price technical and eligibility criteria.',
    full: 'Technical evaluation is the stage where bids are assessed for technical merit, compliance with specifications, and fulfilment of eligibility criteria. Only bids that pass technical evaluation have their financial bids opened. In PARAKH AI, AI-assisted compliance analysis supports the technical evaluation, but committee members and the officer make the final assessment.',
  },
  {
    term: 'Tender',
    category: 'T',
    short: 'A formal invitation to vendors to submit bids to supply goods or services.',
    full: 'A tender is a formal public invitation by a government authority to vendors to submit competitive offers to supply goods, services, or execute works. The tender document specifies scope, eligibility, requirements, evaluation criteria, and submission procedures. Tenders must be published on the GeM portal for central government procurement.',
  },
  // U
  {
    term: 'Udyam Registration',
    category: 'U',
    short: 'Official MSME registration under the Udyam portal.',
    full: 'Udyam Registration is the official process for registering a business as a Micro, Small, or Medium Enterprise in India, replacing the earlier Udyog Aadhaar process. A valid Udyam number entitles a business to MSME procurement benefits in government tenders, including EMD exemption and price preferences.',
  },
]

// Group by first letter
const ALPHABET = Array.from(new Set(TERMS.map((t) => t.category))).sort()

export default function ProcurementGlossary() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [search, setSearch]   = useState('')
  const [expanded, setExpanded] = useState(null)
  const [jumpLetter, setJumpLetter] = useState(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return TERMS
    const q = search.toLowerCase()
    return TERMS.filter(
      (item) =>
        item.term.toLowerCase().includes(q) ||
        item.short.toLowerCase().includes(q) ||
        item.full.toLowerCase().includes(q)
    )
  }, [search])

  const grouped = useMemo(() => {
    return ALPHABET.reduce((acc, letter) => {
      const items = filtered.filter((item) => item.category === letter)
      if (items.length > 0) acc[letter] = items
      return acc
    }, {})
  }, [filtered])

  const clearSearch = () => { setSearch(''); setJumpLetter(null) }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-gray-500" aria-label="Breadcrumb">
        <span
          className="hover:text-blue-600 cursor-pointer"
          onClick={() => navigate('/public/dashboard')}
        >
          {t('public_portal')}
        </span>
        <ChevronRight size={12} aria-hidden="true" />
        <span className="font-medium text-slate-700">{t('procurement_glossary')}</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-indigo-50">
            <BookOpen size={22} className="text-indigo-700" aria-hidden="true" />
          </div>
          <h1 className="page-title">{t('procurement_glossary')}</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          {t('glossary_subtitle')}
        </p>
      </div>

      {/* Search */}
      <div className="relative" role="search">
        <label htmlFor="glossary-search" className="sr-only">Search procurement terms</label>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          id="glossary-search"
          type="search"
          placeholder="Search terms — e.g. corrigendum, EMD, L1…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          aria-label="Search procurement glossary"
        />
        {search && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Alphabet quick-jump */}
      {!search && (
        <nav
          className="flex flex-wrap gap-1"
          aria-label="Alphabetical navigation"
        >
          {ALPHABET.map((letter) => (
            <a
              key={letter}
              href={`#glossary-${letter}`}
              className={`w-7 h-7 flex items-center justify-center text-xs font-bold rounded transition-colors ${
                jumpLetter === letter
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-700'
              }`}
              aria-label={`Jump to section ${letter}`}
              onClick={() => setJumpLetter(letter)}
            >
              {letter}
            </a>
          ))}
        </nav>
      )}

      {/* Results count */}
      {search && (
        <p className="text-xs text-gray-500" role="status" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'} for "{search}"
        </p>
      )}

      {/* Term sections */}
      {Object.keys(grouped).length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <BookOpen size={28} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p className="text-sm">No terms match your search.</p>
          <button className="btn-secondary mt-3 text-xs" onClick={clearSearch}>Clear search</button>
        </div>
      ) : (
        Object.entries(grouped).map(([letter, items]) => (
          <section key={letter} id={`glossary-${letter}`} aria-labelledby={`glossary-heading-${letter}`}>
            <h2
              id={`glossary-heading-${letter}`}
              className="text-lg font-bold text-indigo-700 border-b-2 border-indigo-100 pb-1 mb-3"
            >
              {letter}
            </h2>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.term}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <button
                    className="w-full flex items-start justify-between px-4 py-3 bg-white hover:bg-gray-50 text-left transition-colors"
                    onClick={() => setExpanded(expanded === item.term ? null : item.term)}
                    aria-expanded={expanded === item.term}
                    aria-controls={`glossary-def-${item.term.replace(/\s+/g, '-')}`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.term}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-snug">{item.short}</p>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`text-gray-300 flex-shrink-0 mt-1 transition-transform ${
                        expanded === item.term ? 'rotate-90' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {expanded === item.term && (
                    <div
                      id={`glossary-def-${item.term.replace(/\s+/g, '-')}`}
                      className="px-4 pb-4 pt-1 bg-indigo-50 border-t border-indigo-100"
                    >
                      <p className="text-xs text-slate-700 leading-relaxed">{item.full}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {/* Footer hint */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs text-gray-500 leading-relaxed">
          <BookOpen size={12} className="inline mr-1 text-indigo-400" aria-hidden="true" />
          Don't see a term you're looking for?{' '}
          <button
            className="text-blue-600 font-semibold hover:underline"
            onClick={() => navigate('/public/feedback')}
          >
            Submit feedback
          </button>{' '}
          and we'll add it. Visit the{' '}
          <button
            className="text-blue-600 font-semibold hover:underline"
            onClick={() => navigate('/public/trust-centre')}
          >
            Trust Centre
          </button>{' '}
          for more on how procurement decisions work.
        </p>
      </div>
    </div>
  )
}
