import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

const cliPath = resolve('bin/cli.js');

describe('CLI End-to-End', () => {
  it('prints version with --version flag', () => {
    const stdout = execSync(`node "${cliPath}" --version`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('icp-score v1.0.0'));
  });

  it('prints help with --help flag', () => {
    const stdout = execSync(`node "${cliPath}" --help`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('USAGE'));
    assert.ok(stdout.includes('icp-score <command>'));
  });

  it('validates a valid profile via validate command', () => {
    const stdout = execSync(`node "${cliPath}" validate examples/b2b-saas.yaml`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('Profile is valid'));
    assert.ok(stdout.includes('Weights: 100% total'));
  });

  it('runs scoring on CSV data producing ASCII table output', () => {
    const stdout = execSync(`node "${cliPath}" run examples/b2b-saas.yaml examples/accounts.csv`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('Acme Corp'));
    assert.ok(stdout.includes('tier_1'));
    assert.ok(stdout.includes('disqualified'));
  });

  it('runs scoring on JSON data producing JSON format', () => {
    const stdout = execSync(`node "${cliPath}" run examples/b2b-saas.yaml examples/accounts.json --format json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 20);
    assert.equal(parsed[0].accountId, 'acme-corp');
  });

  it('runs scoring with HTML format and file output', () => {
    const outPath = resolve('test-cli-report.html');
    if (existsSync(outPath)) unlinkSync(outPath);

    execSync(`node "${cliPath}" run examples/b2b-saas.yaml examples/accounts.csv --format html -o "${outPath}"`, { encoding: 'utf-8' });
    assert.ok(existsSync(outPath));
    unlinkSync(outPath);
  });

  it('explains account scoring with explain command', () => {
    const stdout = execSync(`node "${cliPath}" explain examples/b2b-saas.yaml examples/accounts.csv --account acme-corp --no-color`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('Score Explanation: Acme Corp'));
    assert.ok(stdout.includes('Category Breakdown'));
    assert.ok(stdout.includes('firmographics'));
    assert.ok(stdout.includes('technographics'));
  });

  it('generates summary stats with summary command', () => {
    const stdout = execSync(`node "${cliPath}" summary examples/b2b-saas.yaml examples/accounts.csv`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('ICP Scoring Summary'));
    assert.ok(stdout.includes('Total Accounts:'));
    assert.ok(stdout.includes('Tier Distribution:'));
    assert.ok(stdout.includes('Category Averages:'));
  });

  it('generates starter template with init command', () => {
    const stdout = execSync(`node "${cliPath}" init`, { encoding: 'utf-8' });
    assert.ok(stdout.includes('metadata:'));
    assert.ok(stdout.includes('disqualifiers:'));
    assert.ok(stdout.includes('scoring:'));
  });

  it('compares the same input rows even when account IDs are duplicated', () => {
    const baseline = 'examples/b2b-saas.yaml';
    const candidate = 'examples/dev-tools.yaml';
    const input = 'account_id,company_name,industry,revenue,employee_count\n' +
      'same,First company,Government,10000000,100\nsame,Second company,Technology,10000000,100\n';
    const run = (profile) => spawnSync(process.execPath,
      [cliPath, 'compare', baseline, profile, '-', '--format', 'json'], { input, encoding: 'utf8' });
    const comparison = run(candidate);
    assert.equal(comparison.status, 0, comparison.stderr);
    const result = JSON.parse(comparison.stdout);
    assert.equal(result.totalAccounts, 2);
    assert.equal(result.changedAccounts + result.unchangedAccounts, 2);
    assert.ok(result.changes.length > 0);
    for (const change of result.changes) {
      assert.equal(change.accountId, 'same');
      assert.equal(change.companyName, ['First company', 'Second company'][change.inputRow - 1]);
      assert.equal(change.scoreDelta, change.after.score - change.before.score);
    }
    const identical = run(baseline);
    assert.equal(identical.status, 0, identical.stderr);
    assert.deepEqual(JSON.parse(identical.stdout).changes, []);
  });
});
