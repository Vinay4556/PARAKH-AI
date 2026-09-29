# PARAKH AI — Bug-fix & QA report

All fixes were verified with: backend API tests (83 checks), a headless-Chromium sweep of all 63 routes
across the Officer / Bidder / Stakeholder roles (0 issues), and UI interaction tests of each changed flow.

## Backend
| # | Problem | Fix (file) |
|---|---------|-----------|
| 1 | **Audit entries silently erased.** Modules that write JSON directly (bidder_portal, officer_portal, tenders, contracts, grievance) bypassed the in-memory cache used by bidders/dashboard, so a cached read-modify-write on `audit.json` overwrote their entries; dashboards showed stale data. | `services/json_cache.py` now validates the cache against the file's mtime/size on every read, returns deep copies, and writes atomically. |
| 2 | **Duplicate audit IDs** (`AUD-0022`, `AUD-0023` in seed data) from `AUD-{len+1}` at 20 call sites; caused React duplicate-key warnings. | New `services/audit_utils.next_audit_id()` used everywhere; the 2 duplicates in `data/audit.json` renumbered (`AUD-0029`, `AUD-0030`). |
| 3 | **Bidder API had no real authorization**: anonymous users could read a bidder's data or withdraw a bid by sending `bidder_id`; any bidder could submit/withdraw/modify as another bidder or answer another bidder's clarification; invalid tokens fell back to `BID-001`. | `routes/bidder_portal.py`: `@require_role` on every bidder endpoint; bidder identity always comes from the session. Officers may read via `?bidder_id=`. |
| 4 | `submit-bid` accepted nonexistent / cancelled tenders, post-deadline bids, zero/negative/non-numeric prices; duplicate submit returned HTTP 200. | Validated (404/400); duplicate now returns **409** with a clear message; withdrawn bids may be re-submitted; no shadow draft after submit. `modify` validates numbers too (was a 500). |
| 5 | Registration accepted invalid email / unknown tender / non-string name; endpoint was unauthenticated. | `routes/bidders.py` validates input and requires BIDDER/OFFICER. |
| 6 | Placeholder filter used substring matching and blanked legitimate names (e.g. "NABL **Test**ing Laboratories") and phone numbers containing zeros. | Whole-word matching (`bidders.py`). |
| 7 | Uploads: no auth, `bidder_id` used as a folder name (path traversal), raw client filename used on disk. Delete/reprocess had no auth. | `documents.py` + `document_service.py`: auth + ownership checks, `bidder_id` whitelist + existence check, filename basename-sanitised. |
| 8 | Grievances: submitter always recorded as `ANON` (`session['id']` typo), body `bidder_id` trusted, empty grievances accepted. | `routes/grievance.py` |

## Frontend
| # | Problem | Fix |
|---|---------|-----|
| 9 | Duplicate submit displayed "Bid Submitted Successfully" for the *old* bid. | `BidSubmit.jsx` shows the server's message. |
| 10 | Bid form was hard-wired to `GEM-DEMO-2026-001`; "Start Bid" ignored the tender the bidder picked. | Tender passed as `?tender=`; edit mode uses the bid's own tender (`BidSubmit`, `BidderTenders`, `BidderBids`). OPEN tenders get the green badge. |
| 11 | Broken link `/contracts/:id` (bounced to dashboard). | `VendorProfile.jsx` → `/contracts?contract=<id>`; `ContractManagement.jsx` opens that contract and lists **all** contracts (was filtered to the demo tender). |
| 12 | GSTIN regex rejected valid GSTINs (13th char may be 1-9 or A-Z). | `BidderRegister.jsx` |
| 13 | Missing i18n key `against` (all 3 languages); hardcoded "20" requirements. | Locale files + `BidderDetail.jsx` (real count). |
| 14 | Possible circular chunk (`vendor-react` ↔ `vendor-misc`) in production builds. | `vite.config.js`: `react-router` / `@remix-run/router` joined `vendor-react`. Precautionary — could not run `vite build` offline. |

## Things you should still do
* **Rotate the API keys in `backend/.env`** and keep `.env` out of git / shared zips.
* Run `npm install && npm run build` — `frontend/dist/` is stale (predates the i18n chunking).
* The demo tender's deadline is **2026-09-30**. Submitting/modifying/withdrawing bids is (correctly) blocked after
  it — use the officer "Extend deadline" action or edit `data/tenders.json` for later demos.
* Not changed (design decisions): sessions are in-memory (backend restart logs everyone out); a newly
  registered bidder record isn't linked to a login; deleting a bidder also deletes its audit entries;
  read-only document/tampering GET endpoints are still public; JSON-file storage has no cross-process locking.

## Officer Summary — download / print fixes
| Problem | Fix |
|---|---|
| **Print / Download PDF failed (404).** `getOfficerSummaryReportUrl` returned `/api/officer/...` but axios already has `baseURL: '/api'`, so the request went to `/api/api/officer/...`. | `frontend/src/services/api.js`: URL is now `/officer/tenders/:id/summary/report`. |
| Print window blocked / never printed (popup opened after an async call; `load` event never fired after `document.write`). | `OfficerSummary.jsx`: report is rendered in a hidden same-origin iframe and `print()` is called directly. "Download PDF" = print dialog → *Save as PDF*. |
| **Excel export produced a corrupt file** (HTML `<tr>/<td>` inside a SpreadsheetML `<Workbook>`), and the download link was not attached to the DOM (fails in Firefox) and the blob URL was revoked immediately. | Proper `<Row><Cell><Data>` SpreadsheetML with header style, XML-illegal-character stripping, BOM, `downloadBlob()` helper. |
| `frontend/dist` rebuilt with the fixes. | `npm run build` |
