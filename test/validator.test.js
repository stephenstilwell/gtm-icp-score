import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, generateTemplate } from '../src/validator.js';

describe('ICP Profile Validator', () => {
  it('validates a correct profile specification', () => {
    const validProfile = {
      metadata: {
        name: 'Enterprise ICP',
        version: '1.0.0',
      },
      disqualifiers: [
        {
          field: 'revenue',
          operator: 'less_than',
          value: 1000000,
          reason: 'Too low',
        },
      ],
      scoring: {
        firmographics: {
          weight: 60,
          attributes: [
            {
              field: 'revenue',
              rule: 'range',
              ranges: [{ min: 1000000, max: null, score: 100 }],
            },
          ],
        },
        technographics: {
          weight: 40,
          attributes: [
            {
              field: 'has_api',
              rule: 'exists',
              score_if_present: 100,
              score_if_missing: 0,
            },
          ],
        },
      },
      tiers: [
        { name: 'tier_1', min_score: 80 },
        { name: 'tier_2', min_score: 0 },
      ],
    };

    const res = validateProfile(validProfile);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it('rejects profiles whose category weights do not sum to 100', () => {
    const badProfile = {
      metadata: { name: 'Bad Weights' },
      scoring: {
        firmographics: {
          weight: 40,
          attributes: [{ field: 'revenue', rule: 'range', ranges: [{ min: 0, max: null, score: 100 }] }],
        },
        technographics: {
          weight: 40, // 40 + 40 = 80 !== 100
          attributes: [{ field: 'has_api', rule: 'exists' }],
        },
      },
      tiers: [{ name: 't1', min_score: 0 }],
    };

    const res = validateProfile(badProfile);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('must sum to 100')));
  });

  it('rejects unknown rule types', () => {
    const badProfile = {
      metadata: { name: 'Bad Rule' },
      scoring: {
        general: {
          weight: 100,
          attributes: [{ field: 'custom_field', rule: 'non_existent_rule' }],
        },
      },
      tiers: [{ name: 't1', min_score: 0 }],
    };

    const res = validateProfile(badProfile);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('unknown rule type')));
  });

  it('rejects invalid disqualifier operators', () => {
    const badProfile = {
      metadata: { name: 'Bad DQ' },
      disqualifiers: [
        {
          field: 'revenue',
          operator: 'invalid_op',
          value: 10,
        },
      ],
      scoring: {
        general: {
          weight: 100,
          attributes: [{ field: 'revenue', rule: 'range', ranges: [{ min: 0, max: null, score: 100 }] }],
        },
      },
      tiers: [{ name: 't1', min_score: 0 }],
    };

    const res = validateProfile(badProfile);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('unknown operator')));
  });

  it('generates a valid starter template', () => {
    const templateStr = generateTemplate();
    assert.ok(typeof templateStr === 'string');
    assert.ok(templateStr.includes('metadata:'));
    assert.ok(templateStr.includes('disqualifiers:'));
    assert.ok(templateStr.includes('scoring:'));
    assert.ok(templateStr.includes('tiers:'));
  });
});
