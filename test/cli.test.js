import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
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
});
