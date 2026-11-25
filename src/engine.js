/**
 * ICP Scoring Engine — Core scoring logic
 * Pure function: scoreAccount(profile, account) → ScoredAccount
 * Zero external dependencies. Deterministic.
 */

/**
 * Evaluate a single disqualifier rule against an account
 * @param {object} disqualifier - { field, operator, value, reason }
 * @param {object} account - account data
 * @returns {string|null} reason string if disqualified, null otherwise
 */
function evaluateDisqualifier(disqualifier, account) {
  const { field, operator, value, reason } = disqualifier;
  const accountValue = account[field];

  // If the field is missing, we can't disqualify on it (except 'required')
  if (accountValue === undefined || accountValue === null || accountValue === '') {
    if (operator === 'required') {
      return reason || `Required field "${field}" is missing`;
    }
    return null;
  }

  switch (operator) {
    case 'less_than':
      if (Number(accountValue) < value) return reason;
      break;
    case 'greater_than':
      if (Number(accountValue) > value) return reason;
      break;
    case 'equals':
      if (String(accountValue) === String(value)) return reason;
      break;
    case 'not_equals':
      if (String(accountValue) !== String(value)) return reason;
      break;
    case 'in':
      if (Array.isArray(value) && value.map(v => String(v).toLowerCase()).includes(String(accountValue).toLowerCase())) {
        return reason;
      }
      break;
    case 'not_in':
      if (Array.isArray(value) && !value.map(v => String(v).toLowerCase()).includes(String(accountValue).toLowerCase())) {
        return reason;
      }
      break;
    case 'required':
      // Already handled above (field present means not disqualified)
      break;
    default:
      // Unknown operator — skip
      break;
  }

  return null;
}

/**
 * Normalize a value for comparison
 */
function normalizeValue(val) {
  if (val === undefined || val === null || val === '') return null;
  return val;
}

/**
 * Convert account value to an array (handles semicolon-separated strings)
 */
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.includes(';')) return val.split(';').map(s => s.trim());
  if (typeof val === 'string' && val.length > 0) return [val];
  return [];
}

/**
 * Check if a value is "truthy" for exists checks (handles string "true"/"false")
 */
function isTruthy(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    return true;
  }
  return Boolean(val);
}

/**
 * Evaluate a scoring attribute against an account value
 * @param {object} attribute - scoring attribute definition
 * @param {*} accountValue - the account's value for this field
 * @returns {{ score: number, maxScore: number, matched: boolean, rule: string, value: * }}
 */
function evaluateAttribute(attribute, accountValue) {
  const { rule } = attribute;
  const normalizedValue = normalizeValue(accountValue);
  const isMissing = normalizedValue === null;

  const result = {
    field: attribute.field,
    rule,
    value: accountValue !== undefined ? accountValue : null,
    score: 0,
    maxScore: 100,
    matched: false,
  };

  if (isMissing && rule !== 'exists') {
    return result;
  }

  switch (rule) {
    case 'range': {
      const numVal = Number(normalizedValue);
      if (isNaN(numVal)) break;
      const ranges = attribute.ranges || [];
      // Sort ranges by min descending so we match the highest applicable range first
      const sorted = [...ranges].sort((a, b) => (b.min || 0) - (a.min || 0));
      for (const range of sorted) {
        const min = range.min ?? -Infinity;
        const max = range.max ?? Infinity;
        if (numVal >= min && numVal <= max) {
          result.score = range.score;
          result.matched = true;
          break;
        }
      }
      // maxScore is the highest score possible
      result.maxScore = Math.max(...ranges.map(r => r.score), 0);
      break;
    }

    case 'exact_match': {
      const values = attribute.values || {};
      const strVal = String(normalizedValue);
      // Try exact match first, then case-insensitive
      if (values[strVal] !== undefined) {
        result.score = values[strVal];
        result.matched = true;
      } else {
        const lowerVal = strVal.toLowerCase();
        for (const [key, score] of Object.entries(values)) {
          if (key.toLowerCase() === lowerVal) {
            result.score = score;
            result.matched = true;
            break;
          }
        }
      }
      result.maxScore = Math.max(...Object.values(values), 0);
      break;
    }

    case 'contains_any': {
      const accountArr = toArray(normalizedValue);
      const targetValues = attribute.values || [];
      const matchCount = accountArr.filter(v =>
        targetValues.some(t => t.toLowerCase() === v.toLowerCase())
      ).length;

      if (matchCount > 0) {
        result.matched = true;
        // Check match_scoring for tiered scoring based on match count
        if (attribute.match_scoring) {
          const scoring = attribute.match_scoring;
          // Parse scoring keys like "4+", "2-3", "1"
          let scored = false;
          for (const [key, score] of Object.entries(scoring)) {
            if (key.endsWith('+') && matchCount >= parseInt(key)) {
              result.score = score;
              scored = true;
              break;
            }
            if (key.includes('-')) {
              const [low, high] = key.split('-').map(Number);
              if (matchCount >= low && matchCount <= high) {
                result.score = score;
                scored = true;
                break;
              }
            }
            if (String(matchCount) === key) {
              result.score = score;
              scored = true;
              break;
            }
          }
          if (!scored) {
            // Default: score proportionally
            result.score = Math.round((matchCount / targetValues.length) * 100);
          }
          result.maxScore = Math.max(...Object.values(scoring), 0);
        } else {
          // Simple: any match = score based on proportion
          result.score = Math.round((matchCount / targetValues.length) * 100);
          result.maxScore = 100;
        }
      }
      break;
    }

    case 'contains_all': {
      const accountArr = toArray(normalizedValue);
      const targetValues = attribute.values || [];
      const matchCount = accountArr.filter(v =>
        targetValues.some(t => t.toLowerCase() === v.toLowerCase())
      ).length;

      if (matchCount === targetValues.length) {
        result.score = attribute.score || 100;
        result.matched = true;
      } else if (matchCount > 0) {
        result.score = Math.round((matchCount / targetValues.length) * (attribute.score || 100));
        result.matched = true;
      }
      result.maxScore = attribute.score || 100;
      break;
    }

    case 'regex': {
      const pattern = attribute.pattern;
      if (pattern) {
        try {
          const re = new RegExp(pattern, attribute.flags || 'i');
          if (re.test(String(normalizedValue))) {
            result.score = attribute.score || 100;
            result.matched = true;
          }
        } catch {
          // Invalid regex — skip
        }
      }
      result.maxScore = attribute.score || 100;
      break;
    }

    case 'threshold': {
      const numVal = Number(normalizedValue);
      if (isNaN(numVal)) break;
      const thresholds = attribute.thresholds || [];
      // Sort thresholds by min descending
      const sorted = [...thresholds].sort((a, b) => (b.min || 0) - (a.min || 0));
      for (const threshold of sorted) {
        if (numVal >= (threshold.min ?? 0)) {
          result.score = threshold.score;
          result.matched = true;
          break;
        }
      }
      result.maxScore = Math.max(...thresholds.map(t => t.score), 0);
      break;
    }

    case 'exists': {
      const present = isTruthy(normalizedValue) || (normalizedValue !== null && !isMissing);
      if (present && isTruthy(normalizedValue)) {
        result.score = attribute.score_if_present ?? attribute.score ?? 100;
        result.matched = true;
      } else {
        result.score = attribute.score_if_missing ?? 0;
        result.matched = false;
      }
      result.maxScore = attribute.score_if_present ?? attribute.score ?? 100;
      break;
    }

    default:
      // Unknown rule type
      break;
  }

  return result;
}

/**
 * Calculate time-decay signal boost
 * @param {object} signal - signal definition { name, field, boost, decay_days }
 * @param {object} account - account data
 * @param {Date} [now] - current date for determinism in tests
 * @returns {{ name, boost, decayedBoost, reason }|null}
 */
function evaluateSignal(signal, account, now = new Date()) {
  const dateValue = account[signal.field];
  if (!dateValue) return null;

  const signalDate = new Date(dateValue);
  if (isNaN(signalDate.getTime())) return null;

  const daysSince = (now.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24);
  const decayDays = signal.decay_days || 90;

  if (daysSince > decayDays) return null; // Signal has fully decayed
  if (daysSince < 0) return null; // Future date

  // Linear decay
  const decayFactor = 1 - (daysSince / decayDays);
  const decayedBoost = Math.round(signal.boost * decayFactor * 100) / 100;

  return {
    name: signal.name,
    boost: signal.boost,
    decayedBoost,
    reason: `${signal.name}: ${decayedBoost.toFixed(1)} points (${Math.round(decayFactor * 100)}% strength, ${Math.round(daysSince)} days ago)`,
  };
}

/**
 * Determine which tier an account falls into
 * @param {number} score - total score 0-100
 * @param {Array} tiers - tier definitions sorted by min_score desc
 * @returns {{ name, minScore, action }}
 */
function determineTier(score, tiers) {
  // Sort tiers by min_score descending
  const sorted = [...tiers].sort((a, b) => (b.min_score ?? 0) - (a.min_score ?? 0));

  for (const tier of sorted) {
    if (score >= (tier.min_score ?? 0)) {
      return {
        name: tier.name,
        minScore: tier.min_score ?? 0,
        action: tier.action || null,
      };
    }
  }

  // If no tier matches, return the lowest tier
  const lowest = sorted[sorted.length - 1];
  return {
    name: lowest?.name || 'unscored',
    minScore: lowest?.min_score ?? 0,
    action: lowest?.action || null,
  };
}

/**
 * Calculate confidence rating based on percentage of fields that had data
 * @param {number} scoredFields - number of fields with data
 * @param {number} totalFields - total number of scored fields
 * @returns {{ rating: string, percentage: number, scoredFields: number, totalFields: number }}
 */
function calculateConfidence(scoredFields, totalFields) {
  if (totalFields === 0) {
    return { rating: 'None', percentage: 0, scoredFields: 0, totalFields: 0 };
  }

  const percentage = Math.round((scoredFields / totalFields) * 100);

  let rating;
  if (percentage >= 90) rating = 'High';
  else if (percentage >= 70) rating = 'Medium';
  else if (percentage >= 50) rating = 'Low';
  else rating = 'Very Low';

  return { rating, percentage, scoredFields, totalFields };
}

/**
 * Score a single account against an ICP profile
 * @param {object} profile - parsed ICP profile
 * @param {object} account - account data (flat key-value object)
 * @param {object} [options] - optional settings
 * @param {Date} [options.now] - override current date for signal decay (useful for testing)
 * @returns {object} ScoredAccount
 */
export function scoreAccount(profile, account, options = {}) {
  const now = options.now || new Date();
  const accountId = account.account_id || account.accountId || account.id || 'unknown';
  const companyName = account.company_name || account.companyName || account.name || accountId;

  // 1. Check disqualifiers
  const disqualificationReasons = [];
  if (profile.disqualifiers) {
    for (const dq of profile.disqualifiers) {
      const reason = evaluateDisqualifier(dq, account);
      if (reason) {
        disqualificationReasons.push(reason);
      }
    }
  }

  const isDisqualified = disqualificationReasons.length > 0;

  // 2. Score each category
  const categories = [];
  let totalFields = 0;
  let scoredFields = 0;
  const missingFields = [];

  const scoring = profile.scoring || {};
  for (const [categoryName, category] of Object.entries(scoring)) {
    const attributes = category.attributes || [];
    const weight = category.weight || 0;
    const attributeResults = [];
    let categoryRawTotal = 0;
    let categoryMaxTotal = 0;

    for (const attr of attributes) {
      totalFields++;
      const accountValue = account[attr.field];
      const attrResult = evaluateAttribute(attr, accountValue);
      attributeResults.push(attrResult);
      categoryRawTotal += attrResult.score;
      categoryMaxTotal += attrResult.maxScore;

      if (normalizeValue(accountValue) === null) {
        missingFields.push(attr.field);
      } else {
        scoredFields++;
      }
    }

    // Raw score for category: normalize to 0-100
    const rawScore = categoryMaxTotal > 0
      ? Math.round((categoryRawTotal / categoryMaxTotal) * 100)
      : 0;
    const weightedScore = Math.round(rawScore * (weight / 100));

    categories.push({
      name: categoryName,
      weight,
      rawScore,
      weightedScore,
      maxPossible: weight, // maximum weighted contribution
      attributes: attributeResults,
    });
  }

  // 3. Calculate total score
  let totalScore = categories.reduce((sum, cat) => sum + cat.weightedScore, 0);

  // 4. Apply signal boosters
  const appliedSignals = [];
  if (profile.signals) {
    for (const signal of profile.signals) {
      const result = evaluateSignal(signal, account, now);
      if (result) {
        appliedSignals.push(result);
      }
    }
  }

  const signalBoost = appliedSignals.reduce((sum, s) => sum + s.decayedBoost, 0);
  totalScore = Math.min(100, Math.round(totalScore + signalBoost));

  // 5. Determine tier (if disqualified, still assign based on what it would be, but flag it)
  const tiers = profile.tiers || [];
  const tier = isDisqualified
    ? { name: 'disqualified', minScore: 0, action: 'disqualified' }
    : determineTier(totalScore, tiers);

  // 6. Calculate confidence
  const confidence = calculateConfidence(scoredFields, totalFields);

  return {
    accountId,
    companyName,
    totalScore: isDisqualified ? totalScore : totalScore,
    tier,
    confidence,
    categories,
    missingFields,
    disqualified: isDisqualified,
    disqualificationReasons,
    signals: appliedSignals,
  };
}

/**
 * Score multiple accounts against a profile
 * @param {object} profile - parsed ICP profile
 * @param {Array<object>} accounts - array of account data objects
 * @param {object} [options] - options passed to scoreAccount
 * @returns {Array<object>} array of ScoredAccount objects, sorted by score descending
 */
export function scoreAccounts(profile, accounts, options = {}) {
  return accounts
    .map(account => scoreAccount(profile, account, options))
    .sort((a, b) => {
      // Disqualified accounts go to the bottom
      if (a.disqualified && !b.disqualified) return 1;
      if (!a.disqualified && b.disqualified) return -1;
      return b.totalScore - a.totalScore;
    });
}

/** Compare score and routing changes on the same accounts at a shared evaluation time. */
export function compareProfiles(baseline, candidate, accounts, { now = new Date() } = {}) {
  const snapshot = (result) => ({
    score: result.totalScore,
    tier: result.tier.name,
    action: result.tier.action,
    disqualified: result.disqualified,
    confidencePercentage: result.confidence.percentage,
  });
  const changes = [];
  for (const [index, account] of accounts.entries()) {
    const original = scoreAccount(baseline, account, { now });
    const before = snapshot(original);
    const after = snapshot(scoreAccount(candidate, account, { now }));
    const changedFields = Object.keys(before).filter((field) => before[field] !== after[field]);
    if (changedFields.length > 0) {
      changes.push({
        inputRow: index + 1,
        accountId: original.accountId,
        companyName: original.companyName,
        before,
        after,
        changedFields,
        scoreDelta: after.score - before.score,
      });
    }
  }
  return {
    evaluatedAt: now.toISOString(),
    totalAccounts: accounts.length,
    changedAccounts: changes.length,
    unchangedAccounts: accounts.length - changes.length,
    changes,
  };
}

/**
 * Generate summary statistics from scored results
 * @param {Array<object>} results - array of ScoredAccount objects
 * @param {object} profile - the ICP profile
 * @returns {object} summary statistics
 */
export function generateSummary(results, profile) {
  const totalAccounts = results.length;
  const scoredAccounts = results.filter(r => !r.disqualified);
  const disqualifiedAccounts = results.filter(r => r.disqualified);

  // Tier distribution
  const tierDistribution = {};
  for (const result of results) {
    const tierName = result.tier.name;
    tierDistribution[tierName] = (tierDistribution[tierName] || 0) + 1;
  }

  // Average scores
  const avgScore = totalAccounts > 0
    ? Math.round(results.reduce((sum, r) => sum + r.totalScore, 0) / totalAccounts)
    : 0;
  const avgScoredScore = scoredAccounts.length > 0
    ? Math.round(scoredAccounts.reduce((sum, r) => sum + r.totalScore, 0) / scoredAccounts.length)
    : 0;

  // Missing fields frequency
  const missingFieldCounts = {};
  for (const result of results) {
    for (const field of result.missingFields) {
      missingFieldCounts[field] = (missingFieldCounts[field] || 0) + 1;
    }
  }
  const topMissingFields = Object.entries(missingFieldCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([field, count]) => ({
      field,
      count,
      percentage: Math.round((count / totalAccounts) * 100),
    }));

  // Confidence distribution
  const confidenceDistribution = { High: 0, Medium: 0, Low: 0, 'Very Low': 0 };
  for (const result of results) {
    confidenceDistribution[result.confidence.rating] =
      (confidenceDistribution[result.confidence.rating] || 0) + 1;
  }

  // Category averages
  const categoryAverages = {};
  if (results.length > 0) {
    for (const cat of results[0].categories) {
      categoryAverages[cat.name] = {
        avgRawScore: 0,
        avgWeightedScore: 0,
        weight: cat.weight,
      };
    }
    for (const result of results) {
      for (const cat of result.categories) {
        if (categoryAverages[cat.name]) {
          categoryAverages[cat.name].avgRawScore += cat.rawScore;
          categoryAverages[cat.name].avgWeightedScore += cat.weightedScore;
        }
      }
    }
    for (const name of Object.keys(categoryAverages)) {
      categoryAverages[name].avgRawScore = Math.round(categoryAverages[name].avgRawScore / totalAccounts);
      categoryAverages[name].avgWeightedScore = Math.round(categoryAverages[name].avgWeightedScore / totalAccounts);
    }
  }

  // Score distribution (buckets of 10)
  const scoreDistribution = {};
  for (let i = 0; i <= 90; i += 10) {
    const label = `${i}-${i + 9}`;
    scoreDistribution[label] = 0;
  }
  scoreDistribution['100'] = 0;
  for (const result of results) {
    if (result.totalScore === 100) {
      scoreDistribution['100']++;
    } else {
      const bucket = `${Math.floor(result.totalScore / 10) * 10}-${Math.floor(result.totalScore / 10) * 10 + 9}`;
      scoreDistribution[bucket] = (scoreDistribution[bucket] || 0) + 1;
    }
  }

  return {
    totalAccounts,
    scoredAccounts: scoredAccounts.length,
    disqualifiedAccounts: disqualifiedAccounts.length,
    tierDistribution,
    averageScore: avgScore,
    averageScoredScore: avgScoredScore,
    topMissingFields,
    confidenceDistribution,
    categoryAverages,
    scoreDistribution,
    coverageGaps: topMissingFields.filter(f => f.percentage >= 50),
  };
}
