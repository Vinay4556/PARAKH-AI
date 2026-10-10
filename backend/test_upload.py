"""
Test document upload functionality
"""
import requests
import io

# 1. Login as bidder
login_response = requests.post(
    "https://parakh-ai-backend-wg5o.onrender.com/api/auth/login",
    json={"email": "bidder@demo.com", "password": "password"}
)
token = login_response.json()['token']
print(f"✅ Logged in: {login_response.json()['user']['organization_id']}")

headers = {"Authorization": f"Bearer {token}"}

# 2. Create a simple test PDF
pdf_content = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
trailer<</Root 1 0 R>>
%%EOF"""

# 3. Upload document
files = {'files': ('test-gst-cert.pdf', io.BytesIO(pdf_content), 'application/pdf')}
data = {
    'bidder_id': 'BID-001',
    'tender_id': 'GEM-DEMO-2026-001'
}

print("\n📤 Uploading document...")
upload_response = requests.post(
    "https://parakh-ai-backend-wg5o.onrender.com/api/documents/upload",
    headers=headers,
    files=files,
    data=data
)

print(f"Status: {upload_response.status_code}")
if upload_response.status_code == 200:
    result = upload_response.json()
    print(f"✅ Upload successful!")
    print(f"   Uploaded: {result.get('total_uploaded', 0)}")
    print(f"   Documents: {[d.get('filename') for d in result.get('uploaded', [])]}")
else:
    print(f"❌ Upload failed: {upload_response.text}")

# 4. Check documents count
print("\n📋 Checking documents...")
docs_response = requests.get(
    "https://parakh-ai-backend-wg5o.onrender.com/api/bidders/BID-001/documents",
    headers=headers
)
docs = docs_response.json().get('documents', [])
print(f"Total documents: {len(docs)}")
for doc in docs:
    print(f"  - {doc.get('filename')}: {doc.get('classification')}")

# 5. Check bidder
print("\n👤 Checking bidder...")
bidder_response = requests.get(
    "https://parakh-ai-backend-wg5o.onrender.com/api/bidders/BID-001",
    headers={"Authorization": f"Bearer {token}"}
)
bidder = bidder_response.json()
print(f"Document count: {bidder.get('document_count', 0)}")
print(f"Compliance: {bidder.get('compliance_score', 0)}%")
