// src/explainer.js — Detailed score explanation generator

/**
 * Generate a structured explanation for a scored account.
 * @param {object} scoredAccount - The scored result object.
 * @param {object} profile - The ICP profile definition.
 * @returns {object} Structured explanation object.
 */
export function explainAccount(scoredAccount, profile) {
  const {
    accountId,
    companyName,
    totalScore,
    tier,
    confidence,
    categories,
    missingFields,
    disqualified,
    disqualificationReasons,
    signals,
  } = scoredAccount;

  // --- summary ---
  const tierLabel = tier ? `${tier.name}${tier.action ? ` (${tier.action})` : ''}` : 'Untiered';
  const confLabel = confidence
    ? `${confidence.rating} (${confidence.percentage}%)`
    : 'Unknown';
  const summary = disqualified
    ? `Disqualified — Score: ${totalScore}/100, Confidence: ${confLabel}`
    : `${tierLabel} — Score: ${totalScore}/100, Confidence: ${confLabel}`;

  // --- categoryBreakdown ---
  const categoryBreakdown = (categories || []).map((cat) => ({
    category: cat.name,
    weight: cat.weight,
    rawScore: cat.rawScore,
    weightedScore: cat.weightedScore,
    maxPossible: cat.maxPossible,
    attributes: (cat.attributes || []).map((attr) => ({
      field: attr.field,
      rule: attr.rule,
      value: attr.value,
      score: attr.score,
      maxScore: attr.maxScore,
      matched: attr.matched,
    })),
  }));

  // --- missingFields with potential impact ---
  const missingFieldDetails = (missingFields || []).map((field) => {
    let category = null;
    let potentialImpact = 0;

    for (const cat of categories || []) {
      for (const attr of cat.attributes || []) {
        if (attr.field === field) {
          category = cat.name;
          // Impact = the weighted max score this attribute could contribute
          const categoryWeight = cat.weight / 100;
          potentialImpact = Math.round(attr.maxScore * categoryWeight * 100) / 100;
          break;
        }
      }
      if (category) break;
    }

    return { field, category, potentialImpact };
  });

  // --- signals ---
  const signalDetails = (signals || []).map((sig) => ({
    name: sig.name,
    boost: sig.boost,
    decayedBoost: sig.decayedBoost,
    reason: sig.reason,
  }));

  // --- confidence ---
  const confidenceDetail = confidence
    ? {
        rating: confidence.rating,
        percentage: confidence.percentage,
        scoredFields: confidence.scoredFields,
        totalFields: confidence.totalFields,
      }
    : { rating: 'Unknown', percentage: 0, scoredFields: 0, totalFields: 0 };

  return {
    accountId,
    companyName,
    summary,
    disqualified: {
      is: Boolean(disqualified),
      reasons: disqualificationReasons || [],
    },
    categoryBreakdown,
    missingFields: missingFieldDetails,
    signals: signalDetails,
    confidence: confidenceDetail,
  };
}

/**
 * Render an explanation as a readable terminal string with ANSI color codes.
 * @param {object} explanation - The explanation object from explainAccount.
 * @returns {string} Formatted terminal string.
 */
export function formatExplanation(explanation, useColor = true) {
  const c = useColor ? {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
  } : {
    reset: '',
    bold: '',
    dim: '',
    red: '',
    green: '',
    yellow: '',
    blue: '',
    magenta: '',
    cyan: '',
    white: '',
    bgRed: '',
    bgGreen: '',
    bgYellow: '',
    bgBlue: '',
  };

  const lines = [];

  // Header
  lines.push('');
  lines.push(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  lines.push(`${c.bold}  Score Explanation: ${c.white}${explanation.companyName}${c.reset}${c.dim} (${explanation.accountId})${c.reset}`);
  lines.push(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  lines.push('');

  // Summary
  lines.push(`${c.bold}  Summary:${c.reset} ${explanation.summary}`);
  lines.push('');

  // Disqualification
  if (explanation.disqualified.is) {
    lines.push(`${c.bold}${c.red}  ✖ DISQUALIFIED${c.reset}`);
    for (const reason of explanation.disqualified.reasons) {
      lines.push(`    ${c.red}• ${reason}${c.reset}`);
    }
    lines.push('');
  }

  // Category breakdown
  lines.push(`${c.bold}${c.blue}  Category Breakdown${c.reset}`);
  lines.push(`${c.dim}  ${'─'.repeat(59)}${c.reset}`);

  for (const cat of explanation.categoryBreakdown) {
    const pct = Math.max(0, Math.min(100, Math.round(cat.rawScore ?? 0)));
    const barLen = 20;
    const filled = Math.max(0, Math.min(barLen, Math.round((pct / 100) * barLen)));
    const empty = Math.max(0, barLen - filled);
    const bar = `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;

    lines.push(`  ${c.bold}${cat.category}${c.reset} ${c.dim}(weight: ${cat.weight}%)${c.reset}`);
    lines.push(`    ${bar} ${pct}%  ${c.dim}raw: ${cat.rawScore}/100 → weighted: ${cat.weightedScore}/${cat.weight}${c.reset}`);

    for (const attr of cat.attributes) {
      const icon = attr.matched ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      const valStr = attr.value === undefined || attr.value === null ? `${c.dim}(missing)${c.reset}` : String(attr.value);
      lines.push(`      ${icon} ${c.white}${attr.field}${c.reset}: ${valStr}  ${c.dim}[${attr.rule}]${c.reset}  ${c.cyan}${attr.score}/${attr.maxScore}${c.reset}`);
    }
    lines.push('');
  }

  // Signals
  if (explanation.signals.length > 0) {
    lines.push(`${c.bold}${c.magenta}  Signal Boosters${c.reset}`);
    lines.push(`${c.dim}  ${'─'.repeat(59)}${c.reset}`);
    for (const sig of explanation.signals) {
      const decayNote = sig.boost !== sig.decayedBoost
        ? ` ${c.dim}(decayed from +${sig.boost})${c.reset}`
        : '';
      lines.push(`    ${c.magenta}⚡${c.reset} ${c.white}${sig.name}${c.reset}: ${c.green}+${sig.decayedBoost}${c.reset}${decayNote}`);
      if (sig.reason) {
        lines.push(`      ${c.dim}${sig.reason}${c.reset}`);
      }
    }
    lines.push('');
  }

  // Missing fields
  if (explanation.missingFields.length > 0) {
    lines.push(`${c.bold}${c.yellow}  Missing Fields${c.reset}`);
    lines.push(`${c.dim}  ${'─'.repeat(59)}${c.reset}`);
    for (const mf of explanation.missingFields) {
      const impact = mf.potentialImpact > 0 ? ` ${c.yellow}(potential impact: +${mf.potentialImpact})${c.reset}` : '';
      const catLabel = mf.category ? ` ${c.dim}[${mf.category}]${c.reset}` : '';
      lines.push(`    ${c.yellow}?${c.reset} ${c.white}${mf.field}${c.reset}${catLabel}${impact}`);
    }
    lines.push('');
  }

  // Confidence
  lines.push(`${c.bold}${c.cyan}  Confidence${c.reset}`);
  lines.push(`${c.dim}  ${'─'.repeat(59)}${c.reset}`);
  const conf = explanation.confidence;
  const confColor = conf.percentage >= 80 ? c.green : conf.percentage >= 50 ? c.yellow : c.red;
  lines.push(`    Rating: ${confColor}${conf.rating}${c.reset} (${conf.percentage}%)`);
  lines.push(`    Scored fields: ${conf.scoredFields} / ${conf.totalFields}`);
  lines.push('');
  lines.push(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  lines.push('');

  return lines.join('\n');
}
