#!/usr/bin/env node

/**
 * icp-score CLI — Declarative ICP scoring engine
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareProfiles, scoreAccount, scoreAccounts, generateSummary } from '../src/engine.js';
import { loadProfile, loadAccounts } from '../src/loader.js';
import { validateProfile, generateTemplate } from '../src/validator.js';
import { formatOutput, formatTable } from '../src/reporter.js';
import { explainAccount, formatExplanation } from '../src/explainer.js';

const args = process.argv.slice(2);

// Parse flags
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' || args[i] === '-f') {
      flags.format = args[++i];
    } else if (args[i] === '-o' || args[i] === '--output') {
      flags.output = args[++i];
    } else if (args[i] === '--account' || args[i] === '-a') {
      flags.account = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      flags.help = true;
    } else if (args[i] === '--version' || args[i] === '-v') {
      flags.version = true;
    } else if (args[i] === '--no-color') {
      flags.noColor = true;
    } else if (args[i] === '-' || !args[i].startsWith('-')) {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

function printHelp() {
  console.log(`
🎯 icp-score — Declarative ICP Scoring Engine

USAGE
  icp-score <command> [options]

COMMANDS
  run <profile> <data>       Score accounts against an ICP profile
  validate <profile>         Validate an ICP profile definition
  explain <profile> <data>   Detailed score explanation for one account
  init                       Generate a starter ICP template
  summary <profile> <data>   Aggregate scoring statistics
  compare <baseline> <candidate> <data>   Compare account scores and routing across profiles

OPTIONS
  --format, -f <format>      Output format: table, json, csv, html (default: table)
  -o, --output <file>        Write output to file instead of stdout
  --account, -a <id>         Account ID for explain command
  --no-color                 Disable colored output
  --help, -h                 Show this help message
  --version, -v              Show version

EXAMPLES
  icp-score run icp.yaml accounts.csv
  icp-score run icp.yaml accounts.json --format html -o report.html
  icp-score validate icp.yaml
  icp-score explain icp.yaml accounts.json --account acme-corp
  icp-score init > my-icp.yaml
  icp-score summary icp.yaml accounts.csv
  icp-score compare icp.yaml proposed.yaml accounts.csv --format json
  cat accounts.json | icp-score run icp.yaml -
`);
}

function printVersion() {
  console.log('icp-score v1.0.0');
}

async function main() {
  const { flags, positional } = parseFlags(args);

  if (flags.version) {
    printVersion();
    process.exit(0);
  }

  const command = positional[0];
  const subPositional = positional.slice(1);

  if (flags.help || !command) {
    printHelp();
    process.exit(command ? 0 : (flags.help ? 0 : 1));
  }

  try {
    switch (command) {
      case 'run':
        await runCommand(subPositional, flags);
        break;
      case 'validate':
        await validateCommand(subPositional, flags);
        break;
      case 'explain':
        await explainCommand(subPositional, flags);
        break;
      case 'init':
        initCommand(flags);
        break;
      case 'summary':
        await summaryCommand(subPositional, flags);
        break;
      case 'compare':
        await compareCommand(subPositional, flags);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "icp-score --help" for usage information.');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function runCommand(positional, flags) {
  if (positional.length < 2) {
    console.error('Usage: icp-score run <profile> <data>');
    process.exit(1);
  }

  const profilePath = resolve(positional[0]);
  const dataPath = positional[1] === '-' ? '-' : resolve(positional[1]);

  const profile = await loadProfile(profilePath);

  // Validate profile first
  const validation = validateProfile(profile);
  if (!validation.valid) {
    console.error('Profile validation failed:');
    validation.errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  const accounts = await loadAccounts(dataPath);
  const results = scoreAccounts(profile, accounts);
  const format = flags.format || 'table';
  const output = formatOutput(results, profile, format);

  if (flags.output) {
    writeFileSync(resolve(flags.output), output, 'utf-8');
    console.log(`Report written to ${flags.output}`);
  } else {
    console.log(output);
  }
}

async function validateCommand(positional, flags) {
  if (positional.length < 1) {
    console.error('Usage: icp-score validate <profile>');
    process.exit(1);
  }

  const profilePath = resolve(positional[0]);
  const profile = await loadProfile(profilePath);
  const result = validateProfile(profile);

  if (result.valid) {
    console.log('✅ Profile is valid');

    // Show summary
    const scoring = profile.scoring || {};
    const categories = Object.keys(scoring);
    const totalAttrs = categories.reduce((sum, cat) => sum + (scoring[cat].attributes?.length || 0), 0);
    const totalWeight = categories.reduce((sum, cat) => sum + (scoring[cat].weight || 0), 0);

    console.log(`\n  Categories: ${categories.length} (${categories.join(', ')})`);
    console.log(`  Attributes: ${totalAttrs}`);
    console.log(`  Weights: ${totalWeight}% total`);
    console.log(`  Disqualifiers: ${profile.disqualifiers?.length || 0}`);
    console.log(`  Tiers: ${profile.tiers?.length || 0}`);
    console.log(`  Signals: ${profile.signals?.length || 0}`);
  } else {
    console.error('❌ Profile validation failed:\n');
    result.errors.forEach(e => console.error(`  ✗ ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.warn(`  ⚠ ${w}`));
  }

  process.exit(result.valid ? 0 : 1);
}

async function explainCommand(positional, flags) {
  if (positional.length < 2 || !flags.account) {
    console.error('Usage: icp-score explain <profile> <data> --account <id>');
    process.exit(1);
  }

  const profilePath = resolve(positional[0]);
  const dataPath = positional[1] === '-' ? '-' : resolve(positional[1]);

  const profile = await loadProfile(profilePath);
  const accounts = await loadAccounts(dataPath);

  // Find the specific account
  const account = accounts.find(a =>
    (a.account_id || a.accountId || a.id) === flags.account
  );

  if (!account) {
    console.error(`Account "${flags.account}" not found in data.`);
    const ids = accounts.map(a => a.account_id || a.accountId || a.id).filter(Boolean);
    if (ids.length > 0) {
      console.error(`Available accounts: ${ids.join(', ')}`);
    }
    process.exit(1);
  }

  const scored = scoreAccount(profile, account);
  const explanation = explainAccount(scored, profile);

  if (flags.format === 'json') {
    console.log(JSON.stringify(explanation, null, 2));
  } else {
    console.log(formatExplanation(explanation, !flags.noColor));
  }
}

async function compareCommand(positional, flags) {
  if (positional.length !== 3) {
    throw new Error('Usage: icp-score compare <baseline> <candidate> <data> [--format table|json]');
  }
  const format = flags.format || 'table';
  if (!['table', 'json'].includes(format)) {
    throw new Error('The compare command supports table and json output.');
  }
  const [baselinePath, candidatePath, dataPath] = positional;
  const profiles = [];
  for (const [label, file] of [['Baseline', baselinePath], ['Candidate', candidatePath]]) {
    const profile = await loadProfile(resolve(file));
    const validation = validateProfile(profile);
    if (!validation.valid) {
      throw new Error(`${label} profile ${file} failed validation:\n${validation.errors.join('\n')}`);
    }
    profiles.push(profile);
  }

  const accounts = await loadAccounts(dataPath === '-' ? '-' : resolve(dataPath));
  const report = compareProfiles(...profiles, accounts);
  const { totalAccounts, changedAccounts, changes } = report;
  const rows = changes.map(({ inputRow, accountId, companyName, before, after, changedFields }) => {
    const fields = changedFields.map((field) => `${field} ${before[field] ?? 'none'} -> ${after[field] ?? 'none'}`);
    return `  #${inputRow} ${companyName} (${accountId}) | ${fields.join(' | ')}`;
  });
  const output = format === 'json' ? JSON.stringify({ baseline: baselinePath, candidate: candidatePath, ...report }, null, 2) : [
    `ICP profile comparison (${baselinePath} -> ${candidatePath})`,
    `${changedAccounts} of ${totalAccounts} account records changed.`,
    ...rows,
  ].join('\n');

  if (flags.output) {
    writeFileSync(resolve(flags.output), output + '\n', 'utf-8');
    console.log(`Comparison written to ${flags.output}`);
  } else {
    console.log(output);
  }
}

function initCommand(flags) {
  const template = generateTemplate();

  if (flags.output) {
    writeFileSync(resolve(flags.output), template, 'utf-8');
    console.log(`Template written to ${flags.output}`);
  } else {
    console.log(template);
  }
}

async function summaryCommand(positional, flags) {
  if (positional.length < 2) {
    console.error('Usage: icp-score summary <profile> <data>');
    process.exit(1);
  }

  const profilePath = resolve(positional[0]);
  const dataPath = positional[1] === '-' ? '-' : resolve(positional[1]);

  const profile = await loadProfile(profilePath);
  const accounts = await loadAccounts(dataPath);
  const results = scoreAccounts(profile, accounts);
  const summary = generateSummary(results, profile);

  if (flags.format === 'json') {
    const output = JSON.stringify(summary, null, 2);
    if (flags.output) {
      writeFileSync(resolve(flags.output), output, 'utf-8');
      console.log(`Summary written to ${flags.output}`);
    } else {
      console.log(output);
    }
    return;
  }

  // Pretty-print summary
  const lines = [];
  lines.push('');
  lines.push('📊 ICP Scoring Summary');
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`Total Accounts: ${summary.totalAccounts}`);
  lines.push(`  Scored:        ${summary.scoredAccounts}`);
  lines.push(`  Disqualified:  ${summary.disqualifiedAccounts}`);
  lines.push('');
  lines.push(`Average Score: ${summary.averageScore} (all) / ${summary.averageScoredScore} (scored only)`);
  lines.push('');

  // Tier distribution
  lines.push('Tier Distribution:');
  const tiers = profile.tiers || [];
  for (const tier of tiers) {
    const count = summary.tierDistribution[tier.name] || 0;
    const pct = summary.totalAccounts > 0 ? Math.round((count / summary.totalAccounts) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 2));
    lines.push(`  ${tier.name.padEnd(15)} ${String(count).padStart(3)} (${String(pct).padStart(3)}%) ${bar}`);
  }
  lines.push('');

  // Category averages
  lines.push('Category Averages:');
  for (const [name, stats] of Object.entries(summary.categoryAverages)) {
    lines.push(`  ${name.padEnd(20)} avg: ${String(stats.avgRawScore).padStart(3)}/100 (weight: ${stats.weight}%, contribution: ${stats.avgWeightedScore})`);
  }
  lines.push('');

  // Confidence distribution
  lines.push('Confidence Distribution:');
  for (const [rating, count] of Object.entries(summary.confidenceDistribution)) {
    if (count > 0) {
      const pct = Math.round((count / summary.totalAccounts) * 100);
      lines.push(`  ${rating.padEnd(10)} ${String(count).padStart(3)} (${String(pct).padStart(3)}%)`);
    }
  }
  lines.push('');

  // Top missing fields
  if (summary.topMissingFields.length > 0) {
    lines.push('Top Missing Fields:');
    for (const f of summary.topMissingFields) {
      const bar = '░'.repeat(Math.round(f.percentage / 2));
      lines.push(`  ${f.field.padEnd(25)} ${String(f.count).padStart(3)} accounts (${String(f.percentage).padStart(3)}%) ${bar}`);
    }
    lines.push('');
  }

  // Coverage gaps
  if (summary.coverageGaps.length > 0) {
    lines.push('⚠️  Coverage Gaps (>50% missing):');
    for (const f of summary.coverageGaps) {
      lines.push(`  ${f.field} — missing in ${f.percentage}% of accounts`);
    }
    lines.push('');
  }

  const output = lines.join('\n');
  if (flags.output) {
    writeFileSync(resolve(flags.output), output, 'utf-8');
    console.log(`Summary written to ${flags.output}`);
  } else {
    console.log(output);
  }
}

main();
