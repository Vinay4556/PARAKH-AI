# PARAKH AI — SIH26100 · Team Aevora

**Evidence-Driven Procurement Compliance & Performance Intelligence**

> Smart India Hackathon 2026 · Problem Statement SIH26100 · **Team Aevora**  
> Organization: Ministry of Petroleum & Natural Gas · CPCL  
> Category: Software · Theme: Smart Automation

---

## Problem Statement

Government procurement officers at CPCL/CPSEs manually verify hundreds of bidder documents against tender requirements — slow, error-prone, and inconsistent. No cross-verification against government data sources. No historical vendor performance tracking. No public transparency. No structured bid lifecycle management.

## Solution — PARAKH AI

A **full Indian government e-procurement ecosystem** with AI-assisted evaluation, covering the complete procurement lifecycle from tender creation to contract completion and public disclosure.

```
Tender Creation → Pre-Bid Meeting → Corrigendum → Bid Submission →
Bid Opening (Two-Envelope) → Compliance Scrutiny → EMD Verification →
Technical Evaluation → Financial Evaluation → QCBS/L1/RA →
Officer Decision → Contract Award → Delivery → Inspection →
Grievance → Public Disclosure → Vendor 360° Profile
```

The AI is a **decision-support system** at every stage. Final decisions remain exclusively with authorized officers.

---

## Three Portals

| Portal | Login | Access |
|--------|-------|--------|
| **Procurement Officer** | officer@demo.gov / password | Full lifecycle management |
| **Bidder / Vendor** | bidder@demo.com / password | Bid submission, readiness, grievances |
| **Public / Stakeholder** | citizen@demo.com / password | Transparency, timeline, feedback |

---

## Quick Start

```bash
# Backend
cd backend
pip install -r requirements.txt
python app.py
# → http://localhost:5000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Complete Feature Set

### Officer Portal (26 pages)

**Tender Management**
- Create tender with full **Evaluation Policy config** (procurement method: L1/QCBS/Reverse Auction, bid type: Single/Two-Envelope/Three-Stage, QCBS weights, MSE preference, Make in India, OEM, EMD, consortium)
- Tender detail with real-time bid count, corrigenda list, policy summary
- **Deadline Extension** — server-side validated, extension history preserved
- **Tender Cancellation** + **Re-Tender** with parent linkage
- **Corrigendum Engine** — field-level diffs, version history, bidder acknowledgement
- **Pre-Bid Meeting** — schedule (Online/Physical/Hybrid), manage Q&A, publish answers

**Bid Management**
- **Two-Envelope System** — financial bids sealed until officer opens; logged to audit
- **Bid Stage Lifecycle** — SUBMITTED → COMPLIANCE_REVIEW → TECHNICAL_EVALUATION → FINANCIAL_EVALUATION → AWARDED
- **EMD Verification** — AI mismatch detection, officer confirmation
- **Price Reasonableness Engine** — vs estimated value, peer comparison, abnormal bid detection
- **AI Override** — officer overrides AI result with mandatory reason, permanently audit-logged
- Bid Comparison with QCBS 70:30, L1/L2/L3, Recommend Award banner

**Evaluation**
- **Technical Evaluation Committee** — form committee, per-evaluator scoring, aggregate (Average/Min/Max), immutable scores
- **MSE/Startup Preference Verification** — configurable per tender
- **Make in India / Local Content Verification**
- **OEM Authorization Verification**
- **Vendor Integrity Check** — blacklist, debarment, conflict of interest

**Compliance & AI**
- AI compliance engine — 20 requirements, weighted scoring, evidence-based
- Cross-document validation — entity name consistency, date checks
- Document tampering detection — metadata, reused certs, duplicate cert numbers
- Government verification — 8 adapters (GSTN, UDYAM, MCA21, EPFO, ESIC, DIGILOCKER, BLACKLIST, STARTUP_INDIA)
- AI explainability — requirement + evidence + page + confidence + reason for every result
- AI human-in-the-loop states: AI_RECOMMENDATION → OFFICER_REVIEW → OFFICER_CONFIRMED → OFFICER_OVERRIDDEN

**Decision & Contract**
- **Officer Decision** — QUALIFY / DISQUALIFY / CLARIFICATION with tampering/risk interlocks
- **Contract Award UI** — pre-filled from bid data, 5 auto-milestones
- Contract management — milestones, inspection, corrective actions
- Quality inspections with checklist + history
- **Performance security tracking**

**Reverse Auction**
- **RA Simulation** — SCHEDULED → LIVE → CLOSED → FINAL_PRICE
- Live countdown, price board, L1 determination (DEMO / SIMULATED mode)

**Administration**
- **Grievance Centre** — assign, respond, escalate, close
- **Conflict of Interest Declarations**
- Reports — HTML generation + download
- Immutable Audit Trail — 30+ event types
- Alerts, Evaluation Tasks, Feedback Centre
- **In-App Notifications** — real-time bell with unread count
- **Global Procurement Search** — tenders, bidders, bids, contracts (role-aware)

---

### Bidder Portal (9 pages)

- Dashboard with bid readiness score, action alerts, deadline warnings
- Tender Discovery with search/filter
- **Financial Bid Form** — quoted price, GST breakdown (auto-calc), delivery period, bid validity (120 days), payment terms, EMD reference + issuing bank
- **Save as Draft** → **Final Submit** with pre-submission checklist
- **Bid Withdrawal** — server-side deadline check, reason required
- **Bid Modification** — versions archived, deadline enforced
- **Version History** — view all prior bid versions
- My Bids — full lifecycle status, financial summary, withdraw/modify actions
- Bid Readiness — dynamic per-requirement check from uploaded documents
- Clarification responses (bidder → officer)
- **Grievance / Representation submission and tracking**
- Document upload with AI classification

---

### Public / Stakeholder Portal (5 pages)

- Public Dashboard — live tender stats, recent tenders
- Tender Browsing — public-safe data only
- **Procurement Timeline** — 11-stage, dynamically generated for any tender, delay detection
- Public Feedback — AI-classified by priority
- **Grievance Statistics** — public-safe aggregate only

---

## API Endpoints (90+ total)

| Category | Endpoints |
|----------|-----------|
| Auth | login, logout, me, change-password |
| Tenders | list, detail, requirements, bidders, create, **extend**, **cancel**, **re-tender**, corrigendum, corrigendum acknowledge, prebid schedule, prebid questions, prebid answer |
| Bidders | detail, documents, compliance, analyze, decision, create |
| Bids (officer) | list, open-financial, advance-stage, **EMD verify**, **price analysis**, **AI override**, **preference verify**, **local content**, **OEM verify** |
| Bids (bidder) | submit/draft, **withdraw**, **modify**, **versions** |
| Documents | upload, detail, view, download, tampering |
| Contracts | CRUD, milestone, inspections, corrective actions, vendor profiles |
| Verification | adapters, verify, bidder full, GSTN, blacklist |
| Committee | get, form, **submit score** |
| Notifications | get, mark read |
| Grievances | submit, list (officer), bidder list, assign, respond, public stats |
| Integrity | **vendor integrity**, **conflict declarations** |
| Search | **global search** (role-aware) |
| Officer Portal | tasks, clarifications, feedback, leaderboard |
| Bidder Portal | dashboard, tenders, readiness, bids, clarifications |
| Public Portal | dashboard, tenders, detail, timeline, feedback, public vendor profile |
| Reports | generate, download, list, serve |
| Dashboard | stats + audit + charts |

---

## Government Verification Architecture

```python
ADAPTERS = {
  'GSTN':          GSTNAdapter(),        # GSTIN format + entity lookup
  'UDYAM':         UdyamAdapter(),       # MSME registration
  'MCA21':         MCA21Adapter(),       # CIN + company status
  'EPFO':          EPFOAdapter(),        # PF registration
  'ESIC':          ESICAdapter(),        # ESI registration
  'DIGILOCKER':    DigiLockerAdapter(),  # Document verification
  'BLACKLIST':     BlacklistAdapter(),   # Debarment check
  'STARTUP_INDIA': StartupIndiaAdapter() # DPIIT recognition
}
```

Mode switching: `GOV_ADAPTER_MODE=MOCK|SANDBOX|LIVE`  
All adapters in MOCK mode for demo. Sandbox/Live require production credentials.

---

## Scoring & Evaluation Formulas

**Compliance Score:**
```
Score = (Σ satisfied weight / Σ total weight) × 100
Mandatory = 5 pts  |  Optional = 2 pts
REVIEW = 50% credit  |  NON_COMPLIANT / MISSING = 0

Risk:  LOW (≥85%, 0 non-compliant)  MEDIUM (≥70%, ≤1)  HIGH (otherwise)
```

**QCBS Composite:**
```
Technical Score × 70% + Price Score × 30%
Price Score = (L1 price / bidder price) × 100
Min technical threshold: configurable per tender (default 60)
```

---

## Demo Scenario (Full Story)

**Tender:** GEM-DEMO-2026-001 — Supply of Industrial IoT Monitoring Equipment · ₹4.8 Crore  
**EMD:** ₹24 Lakh · **Two-Envelope** · **QCBS 70:30** · **Make in India applicable**

| Bidder | Compliance | Risk | Technical | Price | EMD | Key Issues |
|--------|-----------|------|-----------|-------|-----|------------|
| Nova Engineering | **91%** | LOW | 91/100 | ₹1.35 Cr | ✓ VERIFIED | Minor ISO name variation |
| ABC Technologies | **87%** | MEDIUM | 82/100 | ₹1.18 Cr | ✓ VERIFIED | ISO expiry, OEM name mismatch |
| Bharat Industrial | **61%** | HIGH | 45/100 | ₹92 L | ✗ MISMATCH | Low turnover, missing docs, EMD short |

**Demo Flow (8 minutes):**
1. Officer login → Dashboard → Action widgets (EMD pending, high-risk bids)
2. Tenders → GEM-DEMO-2026-001 → Pre-Bid Meeting Q&A, corrigendum, policy config
3. BID-002 (Bharat) → Compliance → HIGH RISK, tampering flags, EMD mismatch
4. Bid Comparison → QCBS scores, sealed prices → "Open Financial Bids" ceremony
5. QCBS Recommend Award → Nova Engineering → Officer Decision → Contract Award
6. Evaluation Committee → 3 evaluators, scores 91/90/92 → aggregate 91
7. Reverse Auction simulation → price countdown → L1 determined
8. Grievance Centre → ABCs ISO objection → officer responds
9. Bidder login → Submit Bid → Financial form, GST breakup, EMD → Draft → Final Submit
10. Public portal → Timeline → 11 stages → grievance stats

---

## Security

- Token-based auth, SHA-256 hashed passwords
- `@require_role` RBAC on all sensitive routes
- Public APIs return only public-safe fields (no PAN/bank/officer notes)
- Immutable audit trail — every action timestamped and attributed
- Server-side deadline validation for bid submission, withdrawal, modification
- AI override requires mandatory reason — permanently audit-logged
- No secrets in frontend; all credentials via environment variables

---

## Data Models (20 JSON files)

`tenders`, `requirements`, `bidders`, `bids`, `documents`, `contracts`, `inspections`, `corrective_actions`, `vendor_profiles`, `compliance`, `audit`, `clarifications`, `evaluation_tasks`, `feedback`, `notifications`, `grievances`, `eval_committees`, `ai_overrides`, `conflict_declarations`, `users`

All schemas designed for PostgreSQL migration — JSON is the demo store only.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Recharts, Lucide React, Axios |
| Design | Noto Serif + Noto Sans (GoI typography), Navy + Saffron palette, GoI design system |
| Backend | Python 3.10+, Flask 3.0, Flask-CORS |
| Document AI | PyMuPDF — PDF extraction, SHA-256 hashing, tampering analysis |
| Storage | JSON files (demo) → PostgreSQL ready |
| Auth | Token-based, SHA-256, RBAC middleware |
| AI Mode | Demo (deterministic rules) / Live (OPENAI_API_KEY configurable) |

---

## Differentiation

| Feature | Generic Tools | GeM Portal | PARAKH AI |
|---------|--------------|------------|-----------|
| Full bid lifecycle (20 stages) | ✗ | Partial | ✓ |
| AI document classification | Partial | ✗ | ✓ (15 types) |
| Two-envelope bid system | ✗ | ✗ | ✓ |
| QCBS + L1 + Reverse Auction | ✗ | ✗ | ✓ |
| Government cross-verification | ✗ | ✗ | ✓ (8 sources) |
| EMD mismatch detection | ✗ | ✗ | ✓ |
| Document tampering detection | ✗ | ✗ | ✓ |
| Technical committee scoring | ✗ | ✗ | ✓ |
| AI explainability (evidence + page) | ✗ | ✗ | ✓ |
| AI override with audit | ✗ | ✗ | ✓ |
| Bid withdrawal / versioning | ✗ | Partial | ✓ |
| Grievance / representation | ✗ | Partial | ✓ |
| Public procurement timeline | ✗ | Partial | ✓ (dynamic) |
| Vendor 360° profile | ✗ | ✗ | ✓ |
| In-app notifications | ✗ | ✗ | ✓ |
| Global search | ✗ | Partial | ✓ (role-aware) |
| Human-in-the-loop enforced | ✗ | ✗ | ✓ |
| Complete audit trail | Partial | Partial | ✓ (30+ events) |
| Hindi / English | ✗ | ✗ | ✓ |
| Government of India design | ✗ | ✓ | ✓ |

---

## Team

Smart India Hackathon 2026 · **SIH26100** · **Team Aevora**  
Problem: AI-Powered Integrated Bid Compliance Verification Platform for GeM Procurement  
Organization: Ministry of Petroleum & Natural Gas · CPCL

---

*Built to Win. Built to Scale. Built for India.*
