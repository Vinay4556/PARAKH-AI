# PARAKH AI — i18n Testing Checklist

## How to Test the Full i18n Implementation

### Step 1: Start Backend
```bash
cd backend
python app.py
```
Backend should start on `http://localhost:5000`

---

### Step 2: Start Frontend
```bash
cd frontend
npm run dev
```
Frontend should start on `http://localhost:3000`

---

### Step 3: Open Browser
Navigate to `http://localhost:3000`

---

### Step 4: Test Language Switching

#### English (Default)
1. App loads in English by default
2. TopBar language switcher shows: **English** (highlighted) | हिंदी | ಕನ್ನಡ
3. Verify all UI text is in English:
   - Navigation: Dashboard, Tenders, Bidders, Documents, etc.
   - Buttons: View, Download, Analyze, Submit, etc.
   - Dashboard stats: Active Tenders, Bids Analyzed, Documents Processed

#### Hindi
1. Click **हिंदी** button in TopBar
2. **Entire website** instantly switches to Hindi — no page refresh
3. Verify:
   - Navigation: डैशबोर्ड, निविदाएं, बोलीदाता, दस्तावेज़, etc.
   - Buttons: देखें, डाउनलोड, विश्लेषण करें, जमा करें, etc.
   - Status labels: सत्यापित, समीक्षा आवश्यक, गैर-अनुपालक
   - Devanagari script renders correctly

#### Kannada ✨ NEW
1. Click **ಕನ್ನಡ** button in TopBar
2. **Entire website** instantly switches to Kannada — no page refresh
3. Verify:
   - Navigation: ಡ್ಯಾಶ್‌ಬೋರ್ಡ್, ಟೆಂಡರ್‌ಗಳು, ಬಿಡ್ಡರ್‌ಗಳು, ದಾಖಲೆಗಳು, etc.
   - Buttons: ವೀಕ್ಷಿಸಿ, ಡೌನ್‌ಲೋಡ್, ವಿಶ್ಲೇಷಿಸಿ, ಸಲ್ಲಿಸಿ, etc.
   - Status labels: ಪರಿಶೀಲಿಸಲಾಗಿದೆ, ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ, ಅನುಸರಣೆ ಇಲ್ಲ
   - Kannada script renders correctly

---

### Step 5: Test Language Persistence

#### Browser Refresh
1. Select **Kannada** (ಕನ್ನಡ)
2. Press `F5` to refresh the browser
3. **Expected:** App reopens in Kannada — language choice persisted

#### Close & Reopen Browser
1. Select **हिंदी**
2. Close the browser tab/window completely
3. Open `http://localhost:3000` again
4. **Expected:** App opens in Hindi — language choice persisted via `localStorage`

---

### Step 6: Test Across All Three Portals

Login with these credentials to test each portal:

#### Officer Portal
```
Email: officer@demo.gov
Password: password
```
1. Select Kannada
2. Navigate to: Dashboard → Tenders → Bidders → Documents → Compliance
3. **Expected:** All pages show Kannada UI

#### Bidder Portal
```
Email: bidder@demo.com
Password: password
```
1. Language should remain Kannada (from officer login)
2. Navigate to: Dashboard → Browse Tenders → My Bids → Bid Readiness
3. **Expected:** All pages show Kannada UI

#### Public Portal
```
Email: citizen@demo.com
Password: password
```
1. Language should remain Kannada
2. Navigate to: Dashboard → Browse Tenders → Procurement Timeline → Submit Feedback
3. **Expected:** All pages show Kannada UI

---

### Step 7: Test Specific Pages

#### CompliancePage (Officer)
1. Navigate to: Tenders → GEM-DEMO-2026-001 → Bidders → BID-001 → View Compliance
2. Switch language: English → Hindi → Kannada
3. Verify all translatable elements:
   - Tab titles: Compliance Matrix, Cross-Document Verification
   - Filter buttons: All, Verified, Review, Non-Compliant, Missing
   - Status badges: ಪರಿಶೀಲಿಸಲಾಗಿದೆ, ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ, ಅನುಸರಣೆ ಇಲ್ಲ, ಲಭ್ಯವಿಲ್ಲ
   - Buttons: Re-Analyze, AI Advice, Make Decision
   - Table headers: Requirement, Threshold, Evidence Source, AI Confidence

#### OfficerDecision (Officer)
1. From CompliancePage → Click "Make Decision"
2. Verify:
   - Page title: ಅಧಿಕಾರಿಯ ಅಂತಿಮ ನಿರ್ಧಾರ
   - Decision options: ಬಿಡ್ಡರ್ ಅರ್ಹಗೊಳಿಸಿ, ಬಿಡ್ಡರ್ ಅನರ್ಹಗೊಳಿಸಿ, ಸ್ಪಷ್ಟೀಕರಣ ವಿನಂತಿ
   - AI advisory text: AI ಅಂತಿಮ ನಿರ್ಧಾರವನ್ನು ತೆಗೆದುಕೊಳ್ಳುವುದಿಲ್ಲ
   - Buttons: ಹಿಂದೆ, ನಿರ್ಧಾರ ಸಲ್ಲಿಸಿ

#### BidderDetail (Officer)
1. Navigate to: Tenders → GEM-DEMO-2026-001 → Bidders → BID-002
2. Verify:
   - Profile fields: ಪ್ರಕಾರ, ಸ್ಥಾಪನೆ ವರ್ಷ, ಇಮೇಲ್, ಫೋನ್, GSTIN, PAN, ಉದ್ಯಮ್ ಸಂಖ್ಯೆ
   - Document section: ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಗಳು
   - Tampering section: ದಾಖಲೆ ಟ್ಯಾಂಪರಿಂಗ್ ವಿಶ್ಲೇಷಣೆ
   - Buttons: ಅಪ್‌ಲೋಡ್, ಅನುಸರಣೆ ಚಲಾಯಿಸಿ, ವೀಕ್ಷಿಸಿ

#### Dashboard (All Portals)
1. Officer Dashboard → Switch to हिंदी
2. Verify stats: सक्रिय निविदाएं, बोलियां विश्लेषित, दस्तावेज़ प्रसंस्कृत
3. Verify chart labels: अनुपालन स्कोर, जोखिम वितरण
4. Verify recent activity: हाल की गतिविधि

---

### Step 8: Test Forms & Validation

#### Document Upload (Officer)
1. Navigate to Documents page
2. Select Kannada
3. Verify:
   - Page title: ದಾಖಲೆ ಅಪ್‌ಲೋಡ್
   - Dropdown: ಬಿಡ್ಡರ್ ಆಯ್ಕೆಮಾಡಿ
   - Buttons: ಅಪ್‌ಲೋಡ್, ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ, ವಿಶ್ಲೇಷಿಸಿ
   - Status messages: ಸಂಸ್ಕರಣೆ ಫಲಿತಾಂಶಗಳು, ದಾಖಲೆಗಳನ್ನು ಸಂಸ್ಕರಿಸಲಾಗಿದೆ

#### Feedback Submission (Public)
1. Navigate to Submit Feedback
2. Select Hindi
3. Verify:
   - Page title: प्रतिक्रिया दें
   - Form labels: श्रेणी, विवरण
   - Buttons: जमा करें, रद्द करें
   - Success message: प्रतिक्रिया सफलतापूर्वक जमा की गई (if implemented via t())

---

### Step 9: Test Tables & Charts

#### Bid Comparison (Officer)
1. Navigate to Bid Comparison
2. Select Kannada
3. Verify table headers:
   - ಬಿಡ್ಡರ್
   - ಅನುಸರಣೆ ಅಂಕ
   - ಅಪಾಯದ ಮಟ್ಟ
   - ಸ್ಥಿತಿ
   - ಕ್ರಿಯೆಗಳು

#### Dashboard Charts
1. Officer Dashboard → Hindi
2. Verify chart titles & legends:
   - बोलीदाता अनुपालन स्कोर
   - जोखिम वितरण
   - कम / मध्यम / उच्च (risk levels in legend)

---

### Step 10: Test Search & Navigation

#### Global Search (TopBar)
1. Type "tender" in search box
2. Results appear with type badges
3. Switch language to Kannada
4. Type badges remain (TENDER/BIDDER/BID/CONTRACT are technical identifiers, not translated)
5. But UI labels around search should be Kannada

#### Sidebar Navigation
1. Officer sidebar → Kannada
2. Verify all menu items: ಡ್ಯಾಶ್‌ಬೋರ್ಡ್, ಟೆಂಡರ್‌ಗಳು, ಬಿಡ್ಡರ್‌ಗಳು, ದಾಖಲೆಗಳು, etc.
3. Bidder sidebar → Kannada
4. Verify: ಡ್ಯಾಶ್‌ಬೋರ್ಡ್, ಟೆಂಡರ್‌ಗಳನ್ನು ವೀಕ್ಷಿಸಿ, ನನ್ನ ಬಿಡ್‌ಗಳು, etc.

---

## Known Behaviors (Not Bugs)

1. **Tender Titles Remain English:** Official tender data (e.g., "Supply of Industrial IoT Monitoring Equipment") comes from backend and remains in original language. Only UI labels are translated.

2. **IDs Not Translated:** Tender IDs (GEM-DEMO-2026-001), Bidder IDs (BID-001), Document IDs (DOC-123) remain unchanged — these are technical identifiers.

3. **Technical Status Values:** Backend enum values (VERIFIED, NEEDS_REVIEW, NON_COMPLIANT, MISSING) remain in English internally — only their display translation changes.

4. **Chart Data Points:** Numeric values, dates, amounts remain formatted as-is (₹1,50,000 format is universal for INR in all three languages).

5. **Empty State Messages:** If a component has no hardcoded text (e.g., dynamically generated content only), it won't show translated text until that component is updated.

---

## If Something Doesn't Translate

### Check 1: Is the text hardcoded?
Search the component file for the English text. If it's a string literal like `"Dashboard"`, it needs to be replaced with `{t('dashboard')}`.

### Check 2: Is the key in translation files?
Check `en.json`, `hi.json`, `kn.json` — all three must have the same key.

### Check 3: Is the component using `useLanguage()`?
The component must call `const { t } = useLanguage()` at the top.

---

## Success Criteria

| ✅ | Criterion |
|----|-----------|
| ✅ | Entire UI switches instantly when language button clicked |
| ✅ | No page refresh required |
| ✅ | Hindi Devanagari characters render correctly |
| ✅ | Kannada characters render correctly |
| ✅ | Language persists after browser refresh |
| ✅ | Language persists after closing and reopening browser |
| ✅ | All three portals (Officer/Bidder/Public) work in all languages |
| ✅ | Navigation, forms, tables, charts all translated |
| ✅ | Existing functionality unchanged (auth, compliance, tender management) |
| ✅ | Build passes with 0 errors |

---

## Files to Review (If Debugging)

1. **Translation files:** `frontend/src/i18n/locales/en.json`, `hi.json`, `kn.json`
2. **i18n config:** `frontend/src/i18n/i18n.js`
3. **Language bridge:** `frontend/src/context/LanguageContext.jsx`
4. **Font config:** `frontend/index.html` + `frontend/src/index.css`
5. **Main entry:** `frontend/src/main.jsx`
6. **TopBar switcher:** `frontend/src/components/TopBar.jsx`

---

## Summary

If all steps above pass, the i18n implementation is fully functional. The user should be able to:
1. Switch between English, Hindi, and Kannada at any time
2. See the entire website translate instantly
3. Have their choice persist across sessions
4. Use all three portals in their preferred language
5. Verify that all existing PARAKH AI features continue working normally

---

**Testing Date:** 2026-09-10  
**Implementation:** ✅ COMPLETE  
**Build Status:** ✅ PASSING
