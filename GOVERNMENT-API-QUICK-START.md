# Government API Integration — Quick Start

## Current Status

🟡 **MOCK MODE** — Using simulated government data for demonstration

## To Enable Real Government APIs

### Option 1: Quick Test (Uses Public GSTIN Format Validation)
```bash
cd backend
export GOV_ADAPTER_MODE=LIVE
python app.py
```
✅ No API keys needed for format validation
⚠️ Will not fetch actual government records without API credentials

---

### Option 2: Full Production (Requires API Access)

#### Step 1: Get API Credentials

| API | How to Get Access | Link |
|-----|-------------------|------|
| **GSTN** | GSP authorization or third-party service | https://www.gstn.org.in/ |
| **Udyam** | Public portal (no API yet) | https://udyamregistration.gov.in/ |
| **MCA21** | Apply for MCA V3 API | https://www.mca.gov.in/ |
| **EPFO** | MoU with EPFO | https://www.epfindia.gov.in/ |
| **ESIC** | MoU with ESIC | https://www.esic.gov.in/ |
| **DigiLocker** | API Setu registration | https://apisetu.gov.in/ |

#### Step 2: Create `.env` File
Create `backend/.env`:
```bash
GOV_ADAPTER_MODE=LIVE
GSTN_API_KEY=your_key_here
UDYAM_API_KEY=your_key_here
MCA_API_KEY=your_key_here
EPFO_API_KEY=your_key_here
ESIC_API_KEY=your_key_here
DIGILOCKER_CLIENT_ID=your_id
DIGILOCKER_CLIENT_SECRET=your_secret
```

#### Step 3: Install Dependencies
```bash
cd backend
pip install python-dotenv requests
```

#### Step 4: Update app.py
Add to top of `backend/app.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

#### Step 5: Restart Backend
```bash
python app.py
```

---

## What Each Mode Does

### MOCK Mode (Current)
- ✅ Returns realistic demo data
- ✅ Validates formats (GSTIN, Udyam, CIN)
- ✅ Detects name mismatches
- ❌ Does not call real government APIs
- 🎯 **Use for:** Prototype, demo, testing

### LIVE Mode (Production)
- ✅ Calls real government APIs
- ✅ Returns actual government records
- ✅ Real-time verification
- ⚠️ Requires valid API credentials
- ⚠️ May have rate limits
- ⚠️ May incur costs (₹2-5 per query for third-party GSTN)
- 🎯 **Use for:** Production deployment at CPCL/CPSEs

---

## 8 Government Adapters Available

1. **GSTN** — GST Network
   - Verifies GSTIN, company name, status
   - Format: `27AABCA1234B1Z5` (15 chars)
   
2. **Udyam** — MSME Registration
   - Verifies Udyam registration number
   - Format: `UDYAM-MH-12-0034567`
   
3. **MCA21** — Ministry of Corporate Affairs
   - Verifies CIN, company status
   - Format: `U72200MH2009PTC195432` (21 chars)
   
4. **EPFO** — Provident Fund
   - Verifies EPFO registration
   - Format: `MH/BAN/12345`
   
5. **ESIC** — State Insurance
   - Verifies ESIC registration
   - Format: `31000123456`
   
6. **DigiLocker** — Digital Documents
   - Verifies digitally signed documents
   
7. **Blacklist** — Debarment Check
   - Checks against CPSE/GeM blacklist
   
8. **Startup India** — DPIIT Recognition
   - Verifies startup recognition status

---

## Testing

### Test MOCK Mode (No Credentials Needed)
```bash
cd backend
python -c "
from services.gov_adapters import GSTNAdapter
adapter = GSTNAdapter()
result = adapter.verify('27AABCA1234B1Z5', 'ABC Technologies Pvt Ltd')
print(f'Status: {result.status}')
print(f'Entity: {result.entity_name}')
print(f'Mode: {result.mode}')
"
```

Expected Output:
```
Status: ACTIVE
Entity: ABC Technologies Pvt Ltd
Mode: MOCK
```

### Test LIVE Mode (With API Key)
```bash
export GSTN_API_KEY=your_real_key
export GOV_ADAPTER_MODE=LIVE
python -c "
from services.gov_adapters import GSTNAdapter
adapter = GSTNAdapter()
result = adapter.verify('27AABCA1234B1Z5', 'ABC Technologies Pvt Ltd')
print(f'Mode: {result.mode}')
print(f'Source: {result.source}')
"
```

Expected Output:
```
Mode: LIVE
Source: GSTN Production API
```

---

## How to Check Which Mode is Active

### In Frontend
Navigate to **Gov. Verify** page:
- Look for badge near verification results
- **MOCK** badge = Using demo data
- **LIVE** badge = Calling real APIs
- **SANDBOX** badge = Using sandbox/test APIs

### In Backend
Check backend logs when verification runs:
```
INFO: GSTN adapter mode: MOCK
INFO: Verified GSTIN 27AABCA1234B1Z5 - source: GSTN Mock Adapter
```

Or:
```
INFO: GSTN adapter mode: LIVE
INFO: Verified GSTIN 27AABCA1234B1Z5 - source: GSTN Production API
```

---

## Costs (Production)

| Verification | Cost Estimate |
|-------------|---------------|
| GSTIN (Third-Party) | ₹2-5 per query |
| Udyam (Public Portal) | Free |
| MCA Public Search | Free |
| MCA V3 API | ₹10,000-50,000/year subscription |
| EPFO | MoU-based (negotiable) |
| ESIC | MoU-based (negotiable) |
| DigiLocker | Free (sandbox), paid (scale) |
| Startup India | Free |
| Blacklist Check | Internal (maintain database) |

For 1000 bidder verifications/month:
- GSTN: ₹2,000-5,000/month
- Others: Mostly free or fixed subscription

---

## Security Checklist

- [ ] Never commit API keys to Git
- [ ] Add `backend/.env` to `.gitignore`
- [ ] Use environment variables in production
- [ ] Rotate API keys every 90-180 days
- [ ] Log API calls to audit trail
- [ ] Mask identifiers in logs (27XXXXX1234X1X5)
- [ ] Use HTTPS for all API calls
- [ ] Implement rate limiting & caching

---

## Support

For detailed integration instructions, see:
📄 **GOVERNMENT-API-INTEGRATION-GUIDE.md**

For troubleshooting:
- Check backend logs: `tail -f backend/app.log`
- Verify `.env` file is loaded
- Test adapters individually (see code above)
- Ensure `python-dotenv` is installed

---

## Summary

✅ **Current:** MOCK mode — fully functional prototype with realistic demo data  
🎯 **Production:** Set API keys + enable LIVE mode → Real government verifications  
📊 **Code:** `backend/services/gov_adapters.py` — 8 adapters ready for live integration  
🔒 **Security:** Environment variables, no hardcoded keys, audit logging

For SIH 2026 demo: MOCK mode is sufficient and demonstrates full workflow.  
For CPCL/CPSE production: Follow integration guide to enable LIVE mode with real APIs.
