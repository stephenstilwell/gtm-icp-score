import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAccount, scoreAccounts, generateSummary } from '../src/engine.js';

describe('ICP Scoring Engine', () => {
  const sampleProfile = {
    metadata: {
      name: 'Test Profile',
      version: '1.0.0',
    },
    disqualifiers: [
      {
        field: 'revenue',
        operator: 'less_than',
        value: 1000000,
        reason: 'Revenue below $1M',
      },
      {
        field: 'industry',
        operator: 'in',
        value: ['Government', 'Non-Profit'],
        reason: 'Restricted industry',
      },
    ],
    scoring: {
      firmographics: {
        weight: 50,
        attributes: [
          {
            field: 'revenue',
            rule: 'range',
            ranges: [
              { min: 10000000, max: null, score: 100 },
              { min: 5000000, max: 10000000, score: 80 },
              { min: 1000000, max: 5000000, score: 50 },
            ],
          },
          {
            field: 'headquarters_country',
            rule: 'exact_match',
            values: { US: 100, UK: 80, Canada: 70 },
          },
        ],
      },
      technographics: {
        weight: 50,
        attributes: [
          {
            field: 'tech_stack',
            rule: 'contains_any',
            values: ['React', 'Node.js', 'Python', 'AWS'],
            match_scoring: {
              '3+': 100,
              '2': 70,
              '1': 40,
            },
          },
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
      { name: 'tier_1', min_score: 80, action: 'enterprise_ae' },
      { name: 'tier_2', min_score: 50, action: 'sdr_outreach' },
      { name: 'tier_3', min_score: 0, action: 'nurture' },
    ],
    signals: [
      {
        name: 'Recent Funding',
        field: 'recent_funding_date',
        boost: 15,
        decay_days: 90,
      },
    ],
  };

  it('scores an ideal account into tier_1', () => {
    const account = {
      account_id: 'acc-1',
      company_name: 'Super Corp',
      revenue: 15000000,
      headquarters_country: 'US',
      tech_stack: 'React;Node.js;Python;AWS',
      has_api: true,
    };

    const result = scoreAccount(sampleProfile, account);
    assert.equal(result.disqualified, false);
    assert.equal(result.totalScore, 100);
    assert.equal(result.tier.name, 'tier_1');
    assert.equal(result.confidence.rating, 'High');
    assert.equal(result.missingFields.length, 0);
  });

  it('disqualifies account matching disqualifier rule', () => {
    const account = {
      account_id: 'acc-2',
      company_name: 'Gov Agency',
      revenue: 20000000,
      industry: 'Government',
      headquarters_country: 'US',
      tech_stack: 'React;AWS',
      has_api: true,
    };

    const result = scoreAccount(sampleProfile, account);
    assert.equal(result.disqualified, true);
    assert.equal(result.tier.name, 'disqualified');
    assert.ok(result.disqualificationReasons.includes('Restricted industry'));
  });

  it('disqualifies account with revenue below threshold', () => {
    const account = {
      account_id: 'acc-3',
      company_name: 'Tiny Startup',
      revenue: 500000,
      industry: 'Technology',
    };

    const result = scoreAccount(sampleProfile, account);
    assert.equal(result.disqualified, true);
    assert.ok(result.disqualificationReasons.includes('Revenue below $1M'));
  });

  it('handles missing fields and tracks confidence', () => {
    const account = {
      account_id: 'acc-4',
      company_name: 'Sparse Co',
      revenue: 2000000,
      // missing headquarters_country, tech_stack, has_api
    };

    const result = scoreAccount(sampleProfile, account);
    assert.equal(result.disqualified, false);
    assert.ok(result.missingFields.includes('headquarters_country'));
    assert.ok(result.missingFields.includes('tech_stack'));
    assert.ok(result.missingFields.includes('has_api'));
    assert.equal(result.confidence.scoredFields, 1);
    assert.equal(result.confidence.totalFields, 4);
    assert.equal(result.confidence.rating, 'Very Low');
  });

  it('applies time-decay signal boosters deterministically', () => {
    const testDate = new Date('2026-11-20T00:00:00Z');
    const account = {
      account_id: 'acc-5',
      company_name: 'Growth Co',
      revenue: 3000000, // 50 pts * 0.5 = 25
      headquarters_country: 'UK', // 80 pts * 0.5 = 40 (cat raw 65 -> weighted 33)
      tech_stack: 'React', // 40 pts
      has_api: false, // 0 pts (cat raw 20 -> weighted 10)
      recent_funding_date: '2026-11-10T00:00:00Z', // 10 days ago (decay ~89%)
    };

    const result = scoreAccount(sampleProfile, account, { now: testDate });
    assert.ok(result.signals.length === 1);
    assert.equal(result.signals[0].name, 'Recent Funding');
    assert.ok(result.signals[0].decayedBoost > 0);
  });

  it('scores multiple accounts and generates aggregate summary', () => {
    const accounts = [
      {
        account_id: 'a1',
        revenue: 12000000,
        headquarters_country: 'US',
        tech_stack: 'React;Node.js;AWS',
        has_api: true,
      },
      {
        account_id: 'a2',
        revenue: 400000, // DQ
        industry: 'Technology',
      },
      {
        account_id: 'a3',
        revenue: 6000000,
        headquarters_country: 'Canada',
        tech_stack: 'Python',
        has_api: true,
      },
    ];

    const results = scoreAccounts(sampleProfile, accounts);
    assert.equal(results.length, 3);

    const summary = generateSummary(results, sampleProfile);
    assert.equal(summary.totalAccounts, 3);
    assert.equal(summary.disqualifiedAccounts, 1);
    assert.equal(summary.scoredAccounts, 2);
    assert.ok(summary.averageScore > 0);
    assert.ok(summary.tierDistribution.tier_1 !== undefined);
  });
});
