"""
Report Service - Veritas AI
Generates compliance reports in HTML/PDF format.
"""
import os
from datetime import datetime
from config import REPORTS_DIR


def generate_html_report(bidder, tender, compliance_results, score_data, cross_doc_checks):
    """Generate a professional printable HTML compliance report."""
    bidder_name = bidder.get('name', 'Unknown Bidder')
    tender_title = tender.get('title', 'Unknown Tender')
    overall_score = score_data.get('overall_score', 0)
    risk_level = score_data.get('risk_level', 'UNKNOWN')
    status_counts = score_data.get('status_counts', {})
    category_scores = score_data.get('category_scores', {})
    generated_at = datetime.now().strftime('%d %B %Y, %H:%M IST')

    risk_color = {'LOW': '#16a34a', 'MEDIUM': '#d97706', 'HIGH': '#dc2626'}.get(risk_level, '#6b7280')

    rows = []
    for req_id, result in compliance_results.items():
        req = result.get('requirement', {})
        status = result.get('status', 'MISSING')
        color_map = {'VERIFIED': '#16a34a', 'REVIEW': '#d97706', 'NON_COMPLIANT': '#dc2626', 'MISSING': '#6b7280'}
        badge_map = {'VERIFIED': '✓ VERIFIED', 'REVIEW': '⚠ REVIEW', 'NON_COMPLIANT': '✕ NON-COMPLIANT', 'MISSING': '— MISSING'}
        color = color_map.get(status, '#6b7280')
        badge = badge_map.get(status, status)
        mandatory_badge = '<span style="color:#dc2626;font-size:11px">MANDATORY</span>' if req.get('mandatory') else '<span style="color:#6b7280;font-size:11px">OPTIONAL</span>'
        found = result.get('found_value', '—')
        doc = result.get('source_document', {}) or {}
        doc_name = doc.get('filename', '—')
        rows.append(f"""
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9">{req.get('id','')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9"><strong>{req.get('title','')}</strong><br>{mandatory_badge}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9">{req.get('category','')}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9"><span style="color:{color};font-weight:600">{badge}</span></td>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:12px">{found}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:12px">{doc_name}</td>
        </tr>""")

    cross_rows = []
    for check in cross_doc_checks:
        st = check.get('status', '')
        color_map2 = {'CONSISTENT': '#16a34a', 'MISMATCH': '#dc2626', 'MINOR_VARIATION': '#d97706'}
        color2 = color_map2.get(st, '#6b7280')
        cross_rows.append(f"""
        <tr>
          <td style="padding:8px;border-bottom:1px solid #f1f5f9">{check.get('check','')}</td>
          <td style="padding:8px;border-bottom:1px solid #f1f5f9"><span style="color:{color2};font-weight:600">{st}</span></td>
          <td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:12px">{check.get('detail','')}</td>
        </tr>""")

    cat_rows = ''.join(
        f'<tr><td style="padding:6px 8px">{cat}</td><td style="padding:6px 8px"><div style="background:#e2e8f0;border-radius:4px;height:16px;width:200px;display:inline-block"><div style="background:#1e40af;border-radius:4px;height:16px;width:{pct}%"></div></div></td><td style="padding:6px 8px;font-weight:600">{pct}%</td></tr>'
        for cat, pct in category_scores.items()
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Veritas AI — Compliance Report</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; }}
  .header {{ background: #1e3a5f; color: white; padding: 24px 40px; }}
  .header h1 {{ margin: 0; font-size: 22px; letter-spacing: 0.5px; }}
  .header p {{ margin: 4px 0 0; font-size: 13px; opacity: 0.8; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }}
  .content {{ padding: 32px 40px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #f8fafc; text-align: left; padding: 10px 8px; font-size: 12px; color: #64748b; border-bottom: 2px solid #e2e8f0; }}
  .section-title {{ font-size: 16px; font-weight: 700; color: #1e3a5f; margin: 28px 0 12px; border-left: 4px solid #1e40af; padding-left: 10px; }}
  .scorecard {{ display: flex; gap: 16px; margin-bottom: 24px; }}
  .score-box {{ border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; flex: 1; text-align: center; }}
  .score-box .value {{ font-size: 28px; font-weight: 700; }}
  .score-box .label {{ font-size: 11px; color: #64748b; margin-top: 4px; }}
  @media print {{ body {{ -webkit-print-color-adjust: exact; }} }}
</style>
</head>
<body>
<div class="header">
  <h1>🛡 Veritas AI — Compliance Report</h1>
  <p>Evidence-Driven Bid Compliance Intelligence &nbsp;|&nbsp; Team Aevora &nbsp;|&nbsp; SIH 2026 #26100 &nbsp;|&nbsp; Generated: {generated_at}</p>
</div>
<div class="content">
  <div class="section-title">Report Summary</div>
  <table style="margin-bottom:20px">
    <tr><td style="padding:6px;width:200px;color:#64748b;font-size:13px">Tender ID</td><td style="padding:6px;font-weight:600">{tender.get('id','')}</td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Tender Title</td><td style="padding:6px">{tender_title}</td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Bidder</td><td style="padding:6px;font-weight:600">{bidder_name}</td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Department</td><td style="padding:6px">{tender.get('department','')}</td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Estimated Value</td><td style="padding:6px">{tender.get('estimated_value_display','')}</td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Overall Compliance</td><td style="padding:6px"><strong style="font-size:18px;color:#1e40af">{overall_score}%</strong></td></tr>
    <tr><td style="padding:6px;color:#64748b;font-size:13px">Risk Level</td><td style="padding:6px"><strong style="color:{risk_color}">{risk_level}</strong></td></tr>
  </table>

  <div class="scorecard">
    <div class="score-box"><div class="value" style="color:#16a34a">{status_counts.get('VERIFIED',0)}</div><div class="label">VERIFIED</div></div>
    <div class="score-box"><div class="value" style="color:#d97706">{status_counts.get('REVIEW',0)}</div><div class="label">NEEDS REVIEW</div></div>
    <div class="score-box"><div class="value" style="color:#dc2626">{status_counts.get('NON_COMPLIANT',0)}</div><div class="label">NON-COMPLIANT</div></div>
    <div class="score-box"><div class="value" style="color:#6b7280">{status_counts.get('MISSING',0)}</div><div class="label">MISSING</div></div>
  </div>

  <div class="section-title">Category Scores</div>
  <table style="margin-bottom:24px;width:auto">
    <tr><th>Category</th><th>Score Bar</th><th>Score</th></tr>
    {cat_rows}
  </table>

  <div class="section-title">Requirement Compliance Matrix</div>
  <table>
    <tr>
      <th>ID</th><th>Requirement</th><th>Category</th><th>Status</th><th>Finding</th><th>Source Document</th>
    </tr>
    {''.join(rows)}
  </table>

  <div class="section-title">Cross-Document Consistency Checks</div>
  <table>
    <tr><th>Documents Checked</th><th>Status</th><th>Detail</th></tr>
    {''.join(cross_rows)}
  </table>

  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center">
    This report was generated by Veritas AI — Team Aevora · SIH 2026 #26100 · Demo Build.<br>
    AI-assisted compliance verification does not replace final officer review and approval.<br>
    <strong>AI verifies · AI identifies risks · AI recommends · Officer decides.</strong>
  </div>
</div>
</body>
</html>"""
    return html


def save_report(bidder_id, html_content):
    """Save HTML report to disk."""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    filename = f"report_{bidder_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    filepath = os.path.join(REPORTS_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html_content)
    return filename
