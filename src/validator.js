/**
 * ICP Profile Validator
 * Validates profile structure, rules, weights, tiers, etc.
 */

const VALID_RULE_TYPES = ['range', 'exact_match', 'contains_any', 'contains_all', 'regex', 'threshold', 'exists'];
const VALID_DQ_OPERATORS = ['less_than', 'greater_than', 'equals', 'not_equals', 'in', 'not_in', 'required'];

/**
 * Validate an ICP profile
 * @param {object} profile - parsed profile object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateProfile(profile) {
  const errors = [];
  const warnings = [];

  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be a non-null object'], warnings };
  }

  // Validate metadata
  validateMetadata(profile.metadata, errors, warnings);

  // Validate disqualifiers
  validateDisqualifiers(profile.disqualifiers, errors, warnings);

  // Validate scoring
  validateScoring(profile.scoring, errors, warnings);

  // Validate tiers
  validateTiers(profile.tiers, errors, warnings);

  // Validate signals
  validateSignals(profile.signals, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateMetadata(metadata, errors, warnings) {
  if (!metadata) {
    errors.push('Missing required "metadata" section');
    return;
  }

  if (!metadata.name) errors.push('metadata.name is required');
  if (!metadata.version) warnings.push('metadata.version is recommended');
}

function validateDisqualifiers(disqualifiers, errors, warnings) {
  if (!disqualifiers) {
    warnings.push('No disqualifiers defined — all accounts will be scored');
    return;
  }

  if (!Array.isArray(disqualifiers)) {
    errors.push('"disqualifiers" must be an array');
    return;
  }

  for (let i = 0; i < disqualifiers.length; i++) {
    const dq = disqualifiers[i];
    const prefix = `disqualifiers[${i}]`;

    if (!dq.field) errors.push(`${prefix}: missing "field"`);
    if (!dq.operator) {
      errors.push(`${prefix}: missing "operator"`);
    } else if (!VALID_DQ_OPERATORS.includes(dq.operator)) {
      errors.push(`${prefix}: unknown operator "${dq.operator}". Valid: ${VALID_DQ_OPERATORS.join(', ')}`);
    }
    if (dq.value === undefined && dq.operator !== 'required') {
      errors.push(`${prefix}: missing "value" (required for operator "${dq.operator}")`);
    }
    if (!dq.reason) warnings.push(`${prefix}: missing "reason" — will generate generic message`);

    // Validate 'in' / 'not_in' operators have array values
    if ((dq.operator === 'in' || dq.operator === 'not_in') && !Array.isArray(dq.value)) {
      errors.push(`${prefix}: operator "${dq.operator}" requires "value" to be an array`);
    }
  }
}

function validateScoring(scoring, errors, warnings) {
  if (!scoring) {
    errors.push('Missing required "scoring" section');
    return;
  }

  if (typeof scoring !== 'object' || Array.isArray(scoring)) {
    errors.push('"scoring" must be an object with category names as keys');
    return;
  }

  let totalWeight = 0;
  const categoryNames = Object.keys(scoring);

  if (categoryNames.length === 0) {
    errors.push('"scoring" must have at least one category');
    return;
  }

  for (const catName of categoryNames) {
    const category = scoring[catName];
    const prefix = `scoring.${catName}`;

    if (typeof category.weight !== 'number') {
      errors.push(`${prefix}: missing or non-numeric "weight"`);
    } else {
      if (category.weight < 0 || category.weight > 100) {
        errors.push(`${prefix}: weight must be between 0 and 100 (got ${category.weight})`);
      }
      totalWeight += category.weight;
    }

    if (!category.attributes || !Array.isArray(category.attributes)) {
      errors.push(`${prefix}: missing or non-array "attributes"`);
      continue;
    }

    if (category.attributes.length === 0) {
      warnings.push(`${prefix}: no attributes defined`);
    }

    for (let i = 0; i < category.attributes.length; i++) {
      const attr = category.attributes[i];
      const attrPrefix = `${prefix}.attributes[${i}]`;

      if (!attr.field) errors.push(`${attrPrefix}: missing "field"`);
      if (!attr.rule) {
        errors.push(`${attrPrefix}: missing "rule"`);
      } else if (!VALID_RULE_TYPES.includes(attr.rule)) {
        errors.push(`${attrPrefix}: unknown rule type "${attr.rule}". Valid: ${VALID_RULE_TYPES.join(', ')}`);
      } else {
        // Validate rule-specific fields
        validateRuleFields(attr, attrPrefix, errors, warnings);
      }
    }
  }

  // Check weights sum to 100
  if (Math.abs(totalWeight - 100) > 0.01) {
    errors.push(`Category weights must sum to 100 (got ${totalWeight})`);
  }
}

function validateRuleFields(attr, prefix, errors, warnings) {
  switch (attr.rule) {
    case 'range':
      if (!attr.ranges || !Array.isArray(attr.ranges) || attr.ranges.length === 0) {
        errors.push(`${prefix}: "range" rule requires a non-empty "ranges" array`);
      } else {
        for (let i = 0; i < attr.ranges.length; i++) {
          const r = attr.ranges[i];
          if (typeof r.score !== 'number') {
            errors.push(`${prefix}.ranges[${i}]: missing "score"`);
          }
        }
      }
      break;

    case 'exact_match':
      if (!attr.values || typeof attr.values !== 'object' || Array.isArray(attr.values)) {
        errors.push(`${prefix}: "exact_match" rule requires a "values" object (key→score mapping)`);
      }
      break;

    case 'contains_any':
      if (!attr.values || !Array.isArray(attr.values) || attr.values.length === 0) {
        errors.push(`${prefix}: "contains_any" rule requires a non-empty "values" array`);
      }
      break;

    case 'contains_all':
      if (!attr.values || !Array.isArray(attr.values) || attr.values.length === 0) {
        errors.push(`${prefix}: "contains_all" rule requires a non-empty "values" array`);
      }
      break;

    case 'regex':
      if (!attr.pattern) {
        errors.push(`${prefix}: "regex" rule requires a "pattern"`);
      } else {
        try {
          new RegExp(attr.pattern);
        } catch (e) {
          errors.push(`${prefix}: invalid regex pattern "${attr.pattern}": ${e.message}`);
        }
      }
      break;

    case 'threshold':
      if (!attr.thresholds || !Array.isArray(attr.thresholds) || attr.thresholds.length === 0) {
        errors.push(`${prefix}: "threshold" rule requires a non-empty "thresholds" array`);
      } else {
        for (let i = 0; i < attr.thresholds.length; i++) {
          const t = attr.thresholds[i];
          if (typeof t.score !== 'number') {
            errors.push(`${prefix}.thresholds[${i}]: missing "score"`);
          }
          if (typeof t.min !== 'number') {
            errors.push(`${prefix}.thresholds[${i}]: missing "min"`);
          }
        }
      }
      break;

    case 'exists':
      // score_if_present and score_if_missing are optional (defaults exist)
      break;
  }
}

function validateTiers(tiers, errors, warnings) {
  if (!tiers) {
    warnings.push('No tiers defined — accounts will not be categorized');
    return;
  }

  if (!Array.isArray(tiers)) {
    errors.push('"tiers" must be an array');
    return;
  }

  if (tiers.length === 0) {
    warnings.push('No tiers defined — accounts will not be categorized');
    return;
  }

  const tierNames = new Set();
  const thresholds = [];

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const prefix = `tiers[${i}]`;

    if (!tier.name) errors.push(`${prefix}: missing "name"`);
    if (typeof tier.min_score !== 'number') {
      errors.push(`${prefix}: missing or non-numeric "min_score"`);
    }

    if (tier.name && tierNames.has(tier.name)) {
      errors.push(`${prefix}: duplicate tier name "${tier.name}"`);
    }
    tierNames.add(tier.name);

    if (typeof tier.min_score === 'number') {
      thresholds.push({ name: tier.name, minScore: tier.min_score, index: i });
    }

    if (!tier.action) {
      warnings.push(`${prefix}: no "action" defined for tier "${tier.name}"`);
    }
  }

  // Check for overlapping thresholds (each threshold should be unique)
  const sortedThresholds = thresholds.sort((a, b) => b.minScore - a.minScore);
  for (let i = 0; i < sortedThresholds.length - 1; i++) {
    if (sortedThresholds[i].minScore === sortedThresholds[i + 1].minScore) {
      errors.push(
        `Overlapping tier thresholds: "${sortedThresholds[i].name}" and "${sortedThresholds[i + 1].name}" both have min_score ${sortedThresholds[i].minScore}`
      );
    }
  }
}

function validateSignals(signals, errors, warnings) {
  if (!signals) return; // signals are optional

  if (!Array.isArray(signals)) {
    errors.push('"signals" must be an array');
    return;
  }

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const prefix = `signals[${i}]`;

    if (!signal.name) errors.push(`${prefix}: missing "name"`);
    if (!signal.field) errors.push(`${prefix}: missing "field"`);
    if (typeof signal.boost !== 'number') {
      errors.push(`${prefix}: missing or non-numeric "boost"`);
    }
    if (signal.decay_days !== undefined && typeof signal.decay_days !== 'number') {
      errors.push(`${prefix}: "decay_days" must be a number`);
    }
    if (!signal.decay_days) {
      warnings.push(`${prefix}: no "decay_days" set — using default of 90`);
    }
  }
}

/**
 * Generate a starter ICP template
 * @returns {string} YAML template with comments
 */
export function generateTemplate() {
  return `# ICP (Ideal Customer Profile) Scoring Configuration
# Documentation: https://github.com/your-org/gtm-icp-score

metadata:
  name: "My ICP Profile"
  version: "1.0.0"
  description: "Ideal Customer Profile for [Your Product]"
  author: "GTM Team"
  last_updated: "${new Date().toISOString().split('T')[0]}"

# Hard disqualifiers — accounts matching ANY of these are immediately disqualified
disqualifiers:
  - field: revenue
    operator: less_than
    value: 1000000
    reason: "Annual revenue below $1M minimum"
  - field: employee_count
    operator: less_than
    value: 10
    reason: "Company too small (fewer than 10 employees)"
  # - field: industry
  #   operator: in
  #   value: [Government, Education]
  #   reason: "Industry not in target market"

# Scoring categories — weights MUST sum to 100
scoring:
  firmographics:
    weight: 35
    attributes:
      # Range rule: maps numeric ranges to scores
      - field: revenue
        rule: range
        ranges:
          - min: 10000000      # $10M+
            max: null
            score: 100
          - min: 5000000       # $5M-$10M
            max: 10000000
            score: 75
          - min: 1000000       # $1M-$5M
            max: 5000000
            score: 50

      # Exact match rule: maps specific values to scores
      - field: industry
        rule: exact_match
        values:
          Technology: 100
          "Financial Services": 90
          Healthcare: 80
          Manufacturing: 60

      # Exists rule: scores based on field presence
      - field: headquarters_country
        rule: exists
        score_if_present: 70
        score_if_missing: 0

  technographics:
    weight: 25
    attributes:
      # Contains any rule: checks if array contains any target values
      - field: tech_stack
        rule: contains_any
        values: [React, Angular, Vue, Node.js, Python, Go, Kubernetes, Docker]
        match_scoring:
          "4+": 100
          "2-3": 70
          "1": 40

      # Threshold rule: scores based on numeric thresholds
      - field: api_endpoints
        rule: threshold
        thresholds:
          - min: 50
            score: 100
          - min: 20
            score: 70
          - min: 5
            score: 40

  engagement:
    weight: 20
    attributes:
      - field: website_visits
        rule: threshold
        thresholds:
          - min: 20
            score: 100
          - min: 10
            score: 70
          - min: 5
            score: 40
      - field: demo_requested
        rule: exists
        score_if_present: 100
        score_if_missing: 0

  buying_signals:
    weight: 20
    attributes:
      - field: budget_confirmed
        rule: exists
        score_if_present: 100
        score_if_missing: 0
      - field: decision_timeline
        rule: exact_match
        values:
          immediate: 100
          this_quarter: 80
          next_quarter: 50
          next_year: 20

      # Regex rule: matches a pattern
      # - field: company_description
      #   rule: regex
      #   pattern: "\\\\b(SaaS|cloud|platform)\\\\b"
      #   flags: "i"
      #   score: 80

# Tier assignments — first matching tier wins (checked high to low)
tiers:
  - name: tier_1
    min_score: 80
    action: enterprise_ae          # Route to enterprise AE
  - name: tier_2
    min_score: 60
    action: sdr_outbound           # Route to SDR for outbound
  - name: tier_3
    min_score: 40
    action: nurture_sequence       # Add to nurture sequence
  - name: disqualified
    min_score: 0
    action: archive                # Archive / do not pursue

# Signal boosters — time-decaying score additions
signals:
  - name: recent_funding
    field: recent_funding_date     # ISO date field in account data
    boost: 15                      # Maximum boost points
    decay_days: 90                 # Days until boost fully decays

  - name: exec_hiring
    field: exec_hiring_date
    boost: 10
    decay_days: 60
`;
}
