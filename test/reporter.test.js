import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTable, formatJSON, formatCSV, formatOutput } from '../src/reporter.js';
import { generateHTMLReport } from '../src/html-template.js';

describe('Reporter & Formatters', () => {
  const mockProfile = {
    metadata: { name: 'Test ICP' },
    scoring: { general: { weight: 100 } },
    tiers: [{ name: 'tier_1', min_score: 80 }],
  };

  const mockResults = [
    {
      accountId: 'acc-1',
      companyName: 'Acme Corp',
      totalScore: 95,
      tier: { name: 'tier_1' },
      confidence: { rating: 'High', percentage: 100 },
      missingFields: [],
      disqualified: false,
      categories: [
        {
          name: 'general',
          weight: 100,
          rawScore: 95,
          weightedScore: 95,
          maxPossible: 100,
          attributes: [{ field: 'revenue', score: 100, maxScore: 100, matched: true, rule: 'range' }],
        },
      ],
    },
    {
      accountId: 'acc-2',
      companyName: 'Disqualified Co',
      totalScore: 40,
      tier: { name: 'disqualified' },
      confidence: { rating: 'Medium', percentage: 75 },
      missingFields: ['cloud_provider'],
      disqualified: true,
      disqualificationReasons: ['Revenue below min'],
      categories: [],
    },
  ];

  it('formats results as an ASCII table', () => {
    const table = formatTable(mockResults);
    assert.ok(table.includes('Account ID'));
    assert.ok(table.includes('Acme Corp'));
    assert.ok(table.includes('Disqualified Co'));
    assert.ok(table.includes('┌') && table.includes('┘'));
  });

  it('formats results as JSON', () => {
    const jsonStr = formatJSON(mockResults);
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].accountId, 'acc-1');
  });

  it('formats results as CSV', () => {
    const csvStr = formatCSV(mockResults);
    assert.ok(csvStr.includes('account_id,company_name,score,tier,tier_action,confidence_rating,confidence_pct,disqualified,disqualification_reasons,missing_fields'));
    assert.ok(csvStr.includes('acc-1,Acme Corp,95,tier_1,,High,100,false,,'));
    assert.ok(csvStr.includes('acc-2,Disqualified Co,40,disqualified,,Medium,75,true,Revenue below min,cloud_provider'));
  });

  it('generates a self-contained HTML report', () => {
    const html = generateHTMLReport(mockResults, mockProfile);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Test ICP'));
    assert.ok(html.includes('Acme Corp'));
    assert.ok(html.includes('Disqualified Co'));
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('</script>'));
  });

  it('formatOutput dispatches properly across all formats', () => {
    assert.ok(formatOutput(mockResults, mockProfile, 'json').startsWith('['));
    assert.ok(formatOutput(mockResults, mockProfile, 'csv').includes('account_id'));
    assert.ok(formatOutput(mockResults, mockProfile, 'html').includes('<!DOCTYPE html>'));
    assert.ok(formatOutput(mockResults, mockProfile, 'table').includes('┌'));
  });
});
