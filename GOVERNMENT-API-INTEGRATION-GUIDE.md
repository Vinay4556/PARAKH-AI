# PARAKH AI — Government API Integration Guide

## Overview

PARAKH AI's Gov. Verify feature currently operates in **MOCK mode** with simulated government data. To integrate **real Indian Government APIs**, you need to obtain authorized access to various government portals and configure the system to use **LIVE mode**.

This guide explains:
1. Which government APIs are needed
2. How to obtain access credentials
3. How to configure PARAKH AI to use live APIs
4. API integration code structure
5. Testing procedures

---

## Government APIs Required

| # | API | Purpose | Public/Restricted | Portal |
|---|-----|---------|-------------------|--------|
| 1 | **GSTN** | Verify GSTIN, company name, status | Restricted | https://www.gstn.org.in/ |
| 2 | **Udyam** | Verify MSME registration | Public Portal | https://udyamregistration.gov.in/ |
| 3 | **MCA21** | Verify CIN, company details | Public Search | https://www.mca.gov.in/ |
| 4 | **EPFO** | Verify PF registration | Restricted | https://www.epfindia.gov.in/ |
| 5 | **ESIC** | Verify ESI registration | Restricted | https://www.esic.gov.in/ |
| 6 | **DigiLocker** | Fetch digitally signed documents | API Setu | https://www.digilocker.gov.in/ |
| 7 | **Startup India** | Verify DPIIT recognition | Public Portal | https://www.startupindia.gov.in/ |
| 8 | **Debarment List** | Check blacklisted vendors | Internal/CPSE | GeM / CPCL Internal |

---

## 1. GSTN (Goods & Services Tax Network)

### Access Type
**Restricted** — Requires GSP (GST Suvidha Provider) authorization or third-party GST verification service.

### How to Get Access
1. **Option A — Become a GSP:**
   - Apply to GSTN for GSP authorization: https://www.gstn.org.in/
   - Complete empanelment process
   - Receive API credentials (client ID, secret, certificate)
   
2. **Option B — Use Third-Party Service:**
   - Subscribe to authorized GST verification APIs (e.g., GST Verification services by APIs like KYC-API, Sandbox API, etc.)
   - Obtain API key from the service provider

### API Endpoint (Example for Authorized Access)
```
GET https://api.gstin.gov.in/taxpayer?gstin={GSTIN}
Authorization: Bearer {API_KEY}
```

### Integration in PARAKH AI
Set environment variable:
```bash
export GSTN_API_KEY="your_api_key_here"
export GOV_ADAPTER_MODE="LIVE"
```

Code location: `backend/services/gov_adapters.py` → `GSTNAdapter._verify_live()`

### What Data We Verify
- Legal Name
- Trade Name
- Registration Date
- Status (ACTIVE/CANCELLED/SUSPENDED)
- State Code
- Principal Place of Business Address
- Filing Status

---

## 2. Udyam (MSME Registration)

### Access Type
**Public Portal** — Verification available at https://udyamregistration.gov.in/udyam_verify.aspx

### How to Get Access
- **Public Portal:** Anyone can verify Udyam certificates manually
- **API Access:** Official Udyam Verification API not yet publicly released as of 2024
  - Option: Request API access from Ministry of MSME
  - Alternative: Use controlled web scraping (requires compliance with portal TOS)

### Integration Approach
1. **Manual Verification (Current Demo):** Officers verify via portal, enter results manually
2. **Automated (Future):** If Udyam releases official API, integrate using:
   ```bash
   export UDYAM_API_KEY="your_api_key"
   ```

### What Data We Verify
- Enterprise Name
- Udyam Registration Number
- Type (Manufacturing/Service)
- Category (Micro/Small/Medium)
- NIC Code
- State
- Registration Date

---

## 3. MCA21 (Ministry of Corporate Affairs)

### Access Type
**Public Search** — Basic company data available at https://www.mca.gov.in/mcafoportal/companyLLPMasterData.do

**Restricted API** — Full MCA V3 API requires authorization

### How to Get Access
1. **Public Search (Basic Data):**
   - Web scraping of MCA public search portal
   - No API key required but requires responsible scraping
   
2. **MCA V3 API (Full Access):**
   - Apply to MCA for API access: https://www.mca.gov.in/
   - Obtain API credentials after approval
   - Receive client ID, secret, digital signature certificate

### Integration Approach
```bash
export MCA_API_KEY="your_api_key"
```

Code location: `MCA21Adapter._verify_live()`

### What Data We Verify
- Company Name (as per Certificate of Incorporation)
- CIN (Corporate Identification Number)
- Company Status (ACTIVE/STRIKE OFF/DISSOLVED)
- Date of Incorporation
- Registered Office Address
- RoC (Registrar of Companies)
- Company Type (Private/Public/LLP)

---

## 4. EPFO (Employees' Provident Fund Organisation)

### Access Type
**Restricted** — Requires employer/establishment authorization or government MoU

### How to Get Access
1. Establish MoU with EPFO for data access
2. Apply through Unified Member Portal: https://unifiedportal-mem.epfindia.gov.in/
3. Obtain API credentials after approval

### Integration Approach
```bash
export EPFO_API_KEY="your_api_key"
```

### What Data We Verify
- Establishment Name
- EPFO Registration Number
- Status (ACTIVE/INACTIVE)
- Number of Employees (if available)
- Code Number

---

## 5. ESIC (Employees' State Insurance Corporation)

### Access Type
**Restricted** — Similar to EPFO, requires employer authorization

### How to Get Access
1. Apply via ESIC portal: https://www.esic.gov.in/
2. Establish MoU for verification access
3. Receive API credentials

### Integration Approach
```bash
export ESIC_API_KEY="your_api_key"
```

### What Data We Verify
- Employer Name
- ESIC Code
- Status
- State

---

## 6. DigiLocker

### Access Type
**API Setu** — Available via Digital India's API Setu platform

### How to Get Access
1. Register on API Setu: https://apisetu.gov.in/
2. Apply for DigiLocker Sandbox access
3. Complete onboarding process
4. Receive Client ID and Secret
5. Request production access after testing

### Integration Approach
```bash
export DIGILOCKER_CLIENT_ID="your_client_id"
export DIGILOCKER_CLIENT_SECRET="your_secret"
```

### What We Verify
- Digital signatures on uploaded documents
- Document authenticity via DigiLocker URI
- Issuer verification (Government department)

---

## 7. Startup India

### Access Type
**Public Portal** — DPIIT recognition search available at https://www.startupindia.gov.in/content/sih/en/search.html

### How to Get Access
- Public search portal (manual verification)
- No official API as of 2024
- Alternative: Web scraping with responsible usage

### What We Verify
- DPIIT Recognition Number
- Startup Name
- Recognition Status (ACTIVE/EXPIRED)
- Recognition Date

---

## 8. Debarment / Blacklist Check

### Access Type
**Internal / Restricted** — Typically maintained by:
- GeM (Government e-Marketplace)
- CPCL / Individual CPSEs
- CBI (Central Bureau of Investigation) blacklist

### How to Get Access
1. **GeM Debarment List:**
   - Request access from GeM: https://gem.gov.in/
   - May require CPSE authorization
   
2. **CPSE Internal List:**
   - Maintain your own debarment database
   - Cross-check with CBI/CVC lists
   
3. **CBI/CVC Lists:**
   - Available via government circulars
   - May require formal request

### Integration Approach
```python
# Maintain local blacklist database
# Update periodically from official sources
BLACKLISTED_ENTITIES = [
    '27XXXXX1234X1X5',  # GSTIN
    'UDYAM-XX-XX-XXXXXXX',  # Udyam
]
```

---

## Configuration Instructions

### Step 1: Set Adapter Mode
Edit `backend/config.py` or set environment variable:

```bash
# MOCK mode (default — uses demo data)
export GOV_ADAPTER_MODE=MOCK

# LIVE mode (uses real government APIs)
export GOV_ADAPTER_MODE=LIVE

# SANDBOX mode (uses sandbox environments where available)
export GOV_ADAPTER_MODE=SANDBOX
```

### Step 2: Add API Credentials
Create `.env` file in `backend/` directory:

```bash
# Government API Credentials
GOV_ADAPTER_MODE=LIVE
GSTN_API_KEY=your_gstn_api_key_here
UDYAM_API_KEY=your_udyam_key_here
MCA_API_KEY=your_mca_key_here
EPFO_API_KEY=your_epfo_key_here
ESIC_API_KEY=your_esic_key_here
DIGILOCKER_CLIENT_ID=your_digilocker_client_id
DIGILOCKER_CLIENT_SECRET=your_digilocker_secret
```

### Step 3: Install Required Libraries
```bash
pip install requests python-dotenv
```

### Step 4: Load Environment Variables
Update `backend/app.py`:

```python
from dotenv import load_dotenv
load_dotenv()  # Load .env file
```

### Step 5: Test Each Adapter
```bash
cd backend
python -c "
from services.gov_adapters import GSTNAdapter
adapter = GSTNAdapter()
result = adapter.verify('27AABCA1234B1Z5', 'ABC Technologies Pvt Ltd')
print(result)
"
```

---

## API Response Handling

All adapters return a **normalized VerificationResult**:

```python
@dataclass
class VerificationResult:
    adapter: str                    # 'GSTN' | 'UDYAM' | 'MCA21' etc.
    verified: bool                  # True if entity verified successfully
    confidence: float               # 0.0 – 1.0 (API reliability score)
    entity_name: str                # Legal name from government source
    identifier: str                 # GSTIN / Udyam / CIN etc.
    status: str                     # 'ACTIVE' | 'INACTIVE' | 'NOT_FOUND' etc.
    verified_at: str                # ISO timestamp
    source: str                     # 'GSTN Production API' | 'Mock' etc.
    mode: str                       # 'MOCK' | 'SANDBOX' | 'LIVE'
    raw_fields: dict                # Complete API response
    mismatch_flags: list            # Detected name/data mismatches
    notes: str                      # Additional information
```

---

## Error Handling

Each adapter implements retry logic and fallback:

1. **API Call Fails** → Log error, return mock data or NOT_FOUND status
2. **Rate Limit** → Implement exponential backoff
3. **Timeout** → Default timeout: 10 seconds
4. **Invalid Response** → Return ERROR status with notes

Example:
```python
try:
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()
except requests.Timeout:
    logger.error("API timeout")
    return None
except requests.RequestException as e:
    logger.error(f"API call failed: {e}")
    return None
```

---

## Testing Procedure

### Test in MOCK Mode (Current)
```bash
cd backend
export GOV_ADAPTER_MODE=MOCK
python app.py

# Frontend
cd frontend
npm run dev
```

Navigate to Gov. Verify page → Should show mock data with "MOCK" badge

### Test in LIVE Mode
```bash
export GOV_ADAPTER_MODE=LIVE
export GSTN_API_KEY=your_real_key
python app.py
```

Navigate to Gov. Verify → Should show "LIVE" badge and real API data

### Verify API Responses
Check backend logs:
```bash
tail -f backend/app.log
```

Look for:
```
INFO: GSTN API call successful - ACTIVE status
INFO: Udyam verification completed - confidence 0.98
WARNING: MCA API rate limit hit - retrying in 5s
```

---

## Security Best Practices

1. **Never commit API keys to Git**
   - Use `.env` file (add to `.gitignore`)
   - Use environment variables in production
   
2. **Rotate keys periodically**
   - GSTN keys: Every 90 days
   - DigiLocker: Every 180 days
   
3. **Use HTTPS only**
   - All API calls over secure connections
   
4. **Log API calls for audit**
   - Record: timestamp, adapter, identifier, result
   - Store in `audit.json` or database
   
5. **Rate limiting**
   - Respect API rate limits
   - Implement caching for repeated verifications
   
6. **Data privacy**
   - Do not log sensitive PAN/GSTIN details in plain text
   - Mask identifiers in logs: `27XXXXX1234X1X5`

---

## Cost Considerations

| API | Pricing Model | Estimated Cost |
|-----|---------------|----------------|
| GSTN (Third-Party) | Per verification | ₹2-5 per query |
| Udyam | Free (public portal) | Free |
| MCA Public Search | Free | Free |
| MCA V3 API | Subscription | ₹10,000-50,000/year |
| EPFO | MoU-based | Negotiable |
| ESIC | MoU-based | Negotiable |
| DigiLocker | API Setu (Free/Paid) | Free for sandbox, paid for production scale |
| Startup India | Free (public) | Free |

---

## Deployment Checklist

- [ ] Obtain all required API credentials
- [ ] Test each adapter in SANDBOX mode
- [ ] Configure `.env` file with production keys
- [ ] Set `GOV_ADAPTER_MODE=LIVE` in production
- [ ] Implement caching layer (Redis recommended)
- [ ] Set up monitoring/alerts for API failures
- [ ] Document rate limits and handle 429 errors
- [ ] Implement fallback to manual verification if API down
- [ ] Train officers on interpreting live API results
- [ ] Establish SLA with API providers
- [ ] Create incident response plan for API outages

---

## Support Resources

- **GSTN Support:** https://www.gstn.org.in/contact-us/
- **Udyam Support:** https://udyamregistration.gov.in/Contact_Us.aspx
- **MCA Support:** https://www.mca.gov.in/MinistryV2/contactus.html
- **API Setu:** https://apisetu.gov.in/contact-us
- **DigiLocker:** https://www.digilocker.gov.in/support/
- **Digital India:** https://digitalindia.gov.in/

---

## Summary

PARAKH AI is designed to seamlessly switch from **MOCK mode** (demo/prototype) to **LIVE mode** (production) by:
1. Setting environment variables
2. Adding API credentials
3. Enabling LIVE mode

The adapter architecture ensures that the compliance engine never needs to be modified — only the adapter implementation changes. This makes it easy to add new government APIs or switch providers without touching the core business logic.

For the **Smart India Hackathat 2026 prototype**, the system demonstrates the full workflow using realistic mock data. For **production deployment at CPCL/CPSEs**, follow this guide to integrate real government APIs.

---

**Status:** MOCK Mode Active  
**Production Ready:** Pending API Credentials  
**Code Location:** `backend/services/gov_adapters.py`
