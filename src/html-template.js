// src/html-template.js — Self-contained HTML report generator

/**
 * Generate a fully self-contained HTML report string.
 * @param {object[]} results - Array of scored result objects.
 * @param {object} profile - The ICP profile definition.
 * @returns {string} Complete HTML document string.
 */
export function generateHTMLReport(results, profile) {
  const meta = profile.metadata || {};
  const timestamp = new Date().toISOString();

  // Sort results by score descending
  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

  // Tier distribution
  const tierCounts = {};
  for (const r of sorted) {
    const tn = r.disqualified ? 'disqualified' : (r.tier?.name || 'unknown');
    tierCounts[tn] = (tierCounts[tn] || 0) + 1;
  }
  const total = sorted.length || 1;

  // Missing fields heatmap data
  const fieldMissCount = {};
  for (const r of sorted) {
    for (const f of r.missingFields || []) {
      fieldMissCount[f] = (fieldMissCount[f] || 0) + 1;
    }
  }
  const missingSorted = Object.entries(fieldMissCount).sort((a, b) => b[1] - a[1]);

  // Confidence distribution
  const confBuckets = { High: 0, Medium: 0, Low: 0 };
  for (const r of sorted) {
    const rating = r.confidence?.rating || 'Low';
    if (rating in confBuckets) confBuckets[rating]++;
    else confBuckets.Low++;
  }

  const tierColors = {
    tier_1: '#22c55e',
    tier_2: '#3b82f6',
    tier_3: '#eab308',
    disqualified: '#ef4444',
    unknown: '#94a3b8',
  };

  const escapeHTML = (s) => {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Build tier bars HTML
  const tierBarsHTML = Object.entries(tierCounts)
    .map(([name, count]) => {
      const pct = Math.round((count / total) * 100);
      const color = tierColors[name] || '#94a3b8';
      return `<div class="tier-bar-row">
        <span class="tier-label">${escapeHTML(name)}</span>
        <div class="tier-bar-track">
          <div class="tier-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <span class="tier-count">${count} (${pct}%)</span>
      </div>`;
    })
    .join('\n');

  // Build table rows
  const tableRowsHTML = sorted
    .map((r, i) => {
      const tierName = r.disqualified ? 'disqualified' : (r.tier?.name || 'unknown');
      const tierColor = tierColors[tierName] || '#94a3b8';
      const confPct = r.confidence?.percentage ?? 0;
      const confRating = r.confidence?.rating || 'Unknown';

      // Category breakdown for expandable section
      const catRows = (r.categories || [])
        .map((cat) => {
          const attrRows = (cat.attributes || [])
            .map((a) => {
              const icon = a.matched ? '✓' : '✗';
              const iconColor = a.matched ? '#22c55e' : '#ef4444';
              const val = a.value === undefined || a.value === null ? '<em>missing</em>' : escapeHTML(String(a.value));
              return `<tr class="attr-row">
                <td></td>
                <td style="color:${iconColor};font-weight:600;">${icon}</td>
                <td>${escapeHTML(a.field)}</td>
                <td>${val}</td>
                <td>${escapeHTML(a.rule)}</td>
                <td>${a.score}/${a.maxScore}</td>
              </tr>`;
            })
            .join('\n');

          return `<tr class="cat-header-row">
            <td colspan="2" style="font-weight:600;">${escapeHTML(cat.name)}</td>
            <td>Weight: ${cat.weight}%</td>
            <td>Raw: ${cat.rawScore}/${cat.maxPossible}</td>
            <td>Weighted: ${cat.weightedScore}</td>
            <td></td>
          </tr>\n${attrRows}`;
        })
        .join('\n');

      const dqHTML = r.disqualified
        ? `<div class="dq-reasons"><strong>Disqualification Reasons:</strong><ul>${(r.disqualificationReasons || []).map((d) => `<li>${escapeHTML(d)}</li>`).join('')}</ul></div>`
        : '';

      const signalsHTML =
        (r.signals || []).length > 0
          ? `<div class="signals-section"><strong>Signals:</strong><ul>${r.signals.map((s) => `<li>⚡ ${escapeHTML(s.name)}: +${s.decayedBoost}${s.boost !== s.decayedBoost ? ` (original: +${s.boost})` : ''} — ${escapeHTML(s.reason || '')}</li>`).join('')}</ul></div>`
          : '';

      const missingHTML =
        (r.missingFields || []).length > 0
          ? `<div class="missing-section"><strong>Missing:</strong> ${r.missingFields.map((f) => `<span class="missing-tag">${escapeHTML(f)}</span>`).join(' ')}</div>`
          : '';

      return `<tr class="account-row" data-idx="${i}" onclick="toggleDetail(${i})">
        <td>${i + 1}</td>
        <td>${escapeHTML(r.accountId)}</td>
        <td>${escapeHTML(r.companyName)}</td>
        <td class="score-cell">${r.totalScore}</td>
        <td><span class="tier-badge" style="background:${tierColor};">${escapeHTML(tierName)}</span></td>
        <td>${confRating} (${confPct}%)</td>
      </tr>
      <tr class="detail-row" id="detail-${i}" style="display:none;">
        <td colspan="6">
          <div class="detail-content">
            ${dqHTML}
            <table class="breakdown-table">
              <thead><tr><th colspan="2">Category</th><th>Details</th><th>Score</th><th>Rule</th><th>Points</th></tr></thead>
              <tbody>${catRows}</tbody>
            </table>
            ${signalsHTML}
            ${missingHTML}
          </div>
        </td>
      </tr>`;
    })
    .join('\n');

  // Missing data heatmap
  const heatmapHTML =
    missingSorted.length > 0
      ? missingSorted
          .map(([field, count]) => {
            const pct = Math.round((count / total) * 100);
            const intensity = Math.min(pct / 100, 1);
            const r = Math.round(239 * intensity + 241 * (1 - intensity));
            const g = Math.round(68 * intensity + 241 * (1 - intensity));
            const b = Math.round(68 * intensity + 241 * (1 - intensity));
            return `<div class="heatmap-cell" style="background:rgb(${r},${g},${b});">
              <span class="heatmap-field">${escapeHTML(field)}</span>
              <span class="heatmap-count">${count}/${total} (${pct}%)</span>
            </div>`;
          })
          .join('\n')
      : '<p class="empty-note">No missing fields detected.</p>';

  // Confidence distribution bars
  const confColors = { High: '#22c55e', Medium: '#eab308', Low: '#ef4444' };
  const confBarsHTML = Object.entries(confBuckets)
    .map(([label, count]) => {
      const pct = Math.round((count / total) * 100);
      return `<div class="tier-bar-row">
        <span class="tier-label">${label}</span>
        <div class="tier-bar-track">
          <div class="tier-bar-fill" style="width:${pct}%;background:${confColors[label]};"></div>
        </div>
        <span class="tier-count">${count} (${pct}%)</span>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ICP Score Report — ${escapeHTML(meta.name || 'Untitled')}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6;}
.container{max-width:1100px;margin:0 auto;padding:32px 24px;}
h1{font-size:1.75rem;font-weight:700;color:#0f172a;margin-bottom:4px;}
h2{font-size:1.25rem;font-weight:600;color:#334155;margin:32px 0 16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;}
.subtitle{color:#64748b;font-size:0.95rem;margin-bottom:24px;}
.profile-summary{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;display:flex;gap:32px;flex-wrap:wrap;}
.profile-summary .item{display:flex;flex-direction:column;}
.profile-summary .label{font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:600;}
.profile-summary .value{font-size:1rem;font-weight:500;color:#0f172a;}
.section{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;}
.tier-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
.tier-label{width:110px;font-size:0.85rem;font-weight:600;text-align:right;color:#475569;}
.tier-bar-track{flex:1;height:24px;background:#f1f5f9;border-radius:4px;overflow:hidden;}
.tier-bar-fill{height:100%;border-radius:4px;transition:width 0.3s;}
.tier-count{width:90px;font-size:0.85rem;color:#64748b;}
table.scored-table{width:100%;border-collapse:collapse;font-size:0.9rem;}
table.scored-table th{background:#f8fafc;border-bottom:2px solid #e2e8f0;padding:10px 12px;text-align:left;cursor:pointer;user-select:none;white-space:nowrap;color:#475569;font-weight:600;}
table.scored-table th:hover{color:#0f172a;background:#f1f5f9;}
table.scored-table th::after{content:'';display:inline-block;margin-left:4px;opacity:0.3;font-size:0.7em;}
table.scored-table th.sort-asc::after{content:'▲';opacity:1;}
table.scored-table th.sort-desc::after{content:'▼';opacity:1;}
.account-row td{padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;}
.account-row:hover td{background:#f8fafc;}
.score-cell{font-weight:700;font-variant-numeric:tabular-nums;}
.tier-badge{display:inline-block;padding:2px 10px;border-radius:12px;color:#fff;font-size:0.8rem;font-weight:600;}
.detail-row td{padding:0 !important;border-bottom:1px solid #e2e8f0;}
.detail-content{padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;}
.breakdown-table{width:100%;border-collapse:collapse;font-size:0.85rem;margin:8px 0;}
.breakdown-table th{text-align:left;padding:6px 8px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-weight:600;color:#475569;}
.breakdown-table td{padding:6px 8px;border-bottom:1px solid #f1f5f9;}
.cat-header-row td{background:#f1f5f9;font-weight:600;}
.attr-row td{padding-left:24px;}
.dq-reasons{margin-bottom:12px;color:#ef4444;}
.dq-reasons ul{margin-left:20px;}
.signals-section{margin-top:12px;}
.signals-section ul{margin-left:20px;}
.missing-section{margin-top:12px;}
.missing-tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:0.8rem;margin:2px;}
.heatmap-grid{display:flex;flex-wrap:wrap;gap:8px;}
.heatmap-cell{padding:10px 14px;border-radius:6px;display:flex;flex-direction:column;min-width:140px;}
.heatmap-field{font-weight:600;font-size:0.85rem;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.3);}
.heatmap-count{font-size:0.75rem;color:rgba(255,255,255,0.85);}
.empty-note{color:#94a3b8;font-style:italic;}
.footer{text-align:center;padding:24px 0;color:#94a3b8;font-size:0.8rem;border-top:1px solid #e2e8f0;margin-top:32px;}
</style>
</head>
<body>
<div class="container">

<h1>🎯 ICP Score Report</h1>
<p class="subtitle">Generated from profile: <strong>${escapeHTML(meta.name || 'Untitled')}</strong></p>

<div class="profile-summary">
  <div class="item"><span class="label">Profile</span><span class="value">${escapeHTML(meta.name || 'N/A')}</span></div>
  <div class="item"><span class="label">Version</span><span class="value">${escapeHTML(meta.version || 'N/A')}</span></div>
  <div class="item"><span class="label">Description</span><span class="value">${escapeHTML(meta.description || 'N/A')}</span></div>
  <div class="item"><span class="label">Accounts Scored</span><span class="value">${sorted.length}</span></div>
</div>

<h2>Tier Distribution</h2>
<div class="section">
${tierBarsHTML}
</div>

<h2>Scored Accounts</h2>
<div class="section" style="overflow-x:auto;">
<table class="scored-table" id="scored-table">
  <thead>
    <tr>
      <th data-col="0" data-type="num">Rank</th>
      <th data-col="1" data-type="str">Account</th>
      <th data-col="2" data-type="str">Company</th>
      <th data-col="3" data-type="num">Score</th>
      <th data-col="4" data-type="str">Tier</th>
      <th data-col="5" data-type="str">Confidence</th>
    </tr>
  </thead>
  <tbody>
${tableRowsHTML}
  </tbody>
</table>
</div>

<h2>Missing Data Heatmap</h2>
<div class="section">
<div class="heatmap-grid">
${heatmapHTML}
</div>
</div>

<h2>Confidence Distribution</h2>
<div class="section">
${confBarsHTML}
</div>

<div class="footer">
  Report generated on ${escapeHTML(timestamp)} · gtm-icp-score v${escapeHTML(meta.version || '1.0.0')}
</div>

</div>

<script>
// Sort table by clicking column headers
(function(){
  var table=document.getElementById('scored-table');
  if(!table)return;
  var headers=table.querySelectorAll('th');
  var tbody=table.querySelector('tbody');
  var currentSort={col:-1,asc:true};

  headers.forEach(function(th){
    th.addEventListener('click',function(){
      var col=parseInt(th.getAttribute('data-col'));
      var type=th.getAttribute('data-type');
      var asc=currentSort.col===col?!currentSort.asc:true;
      currentSort={col:col,asc:asc};

      headers.forEach(function(h){h.classList.remove('sort-asc','sort-desc');});
      th.classList.add(asc?'sort-asc':'sort-desc');

      // Gather account rows and their detail rows
      var rows=Array.from(tbody.querySelectorAll('tr.account-row'));
      rows.sort(function(a,b){
        var cellA=a.children[col];
        var cellB=b.children[col];
        var vA=cellA?cellA.textContent.trim():'';
        var vB=cellB?cellB.textContent.trim():'';
        if(type==='num'){vA=parseFloat(vA)||0;vB=parseFloat(vB)||0;}
        else{vA=vA.toLowerCase();vB=vB.toLowerCase();}
        if(vA<vB)return asc?-1:1;
        if(vA>vB)return asc?1:-1;
        return 0;
      });

      // Re-append rows keeping detail rows paired
      rows.forEach(function(row){
        var idx=row.getAttribute('data-idx');
        var detail=document.getElementById('detail-'+idx);
        tbody.appendChild(row);
        if(detail)tbody.appendChild(detail);
      });
    });
  });
})();

// Toggle expandable detail rows
function toggleDetail(idx){
  var detail=document.getElementById('detail-'+idx);
  if(!detail)return;
  detail.style.display=detail.style.display==='none'?'table-row':'none';
}
</script>
</body>
</html>`;
}
