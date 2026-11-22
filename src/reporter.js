// src/reporter.js — Output formatting layer

import { generateHTMLReport } from './html-template.js';

/**
 * Format scored results as an ASCII table for terminal output.
 * @param {object[]} results - Array of scored result objects.
 * @param {object} [options] - Optional display options.
 * @returns {string} Formatted ASCII table.
 */
export function formatTable(results, options = {}) {
  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

  const columns = [
    { key: 'accountId', header: 'Account ID', width: 20 },
    { key: 'companyName', header: 'Company', width: 22 },
    { key: 'totalScore', header: 'Score', width: 7, align: 'right' },
    { key: 'tier', header: 'Tier', width: 16 },
    { key: 'confidence', header: 'Confidence', width: 18 },
    { key: 'missingFields', header: 'Top Missing Fields', width: 30 },
  ];

  // Compute dynamic column widths based on data
  for (const col of columns) {
    col.width = Math.max(col.width, col.header.length + 2);
    for (const r of sorted) {
      const val = getCellValue(r, col.key);
      col.width = Math.max(col.width, val.length + 2);
    }
    // Cap width at a maximum for readability
    col.width = Math.min(col.width, options.maxColWidth || 40);
  }

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0) + columns.length + 1;

  // Box-drawing characters
  const topLeft = '┌';
  const topRight = '┐';
  const bottomLeft = '└';
  const bottomRight = '┘';
  const horizontal = '─';
  const vertical = '│';
  const tDown = '┬';
  const tUp = '┴';
  const tRight = '├';
  const tLeft = '┤';
  const cross = '┼';

  const topBorder = topLeft + columns.map((c) => horizontal.repeat(c.width)).join(tDown) + topRight;
  const headerSep = tRight + columns.map((c) => horizontal.repeat(c.width)).join(cross) + tLeft;
  const bottomBorder = bottomLeft + columns.map((c) => horizontal.repeat(c.width)).join(tUp) + bottomRight;

  const padCell = (text, width, align) => {
    const truncated = text.length > width - 2 ? text.slice(0, Math.max(0, width - 5)) + '...' : text;
    const padded = Math.max(0, width - 2 - truncated.length);
    if (align === 'right') {
      return ' ' + ' '.repeat(padded) + truncated + ' ';
    }
    return ' ' + truncated + ' '.repeat(padded) + ' ';
  };

  const headerRow = vertical + columns.map((c) => padCell(c.header, c.width, c.align)).join(vertical) + vertical;

  const dataRows = sorted.map((r) => {
    return vertical + columns.map((c) => padCell(getCellValue(r, c.key), c.width, c.align)).join(vertical) + vertical;
  });

  const lines = [topBorder, headerRow, headerSep, ...dataRows, bottomBorder];
  return lines.join('\n');
}

function getCellValue(result, key) {
  switch (key) {
    case 'accountId':
      return result.accountId || '';
    case 'companyName':
      return result.companyName || '';
    case 'totalScore':
      return String(result.totalScore ?? 0);
    case 'tier':
      if (result.disqualified) return 'disqualified';
      return result.tier?.name || 'unknown';
    case 'confidence':
      if (!result.confidence) return 'Unknown';
      return `${result.confidence.rating} (${result.confidence.percentage}%)`;
    case 'missingFields': {
      const fields = result.missingFields || [];
      if (fields.length === 0) return 'None';
      const top = fields.slice(0, 3).join(', ');
      return fields.length > 3 ? `${top} (+${fields.length - 3})` : top;
    }
    default:
      return '';
  }
}

/**
 * Format scored results as pretty-printed JSON.
 * @param {object[]} results - Array of scored result objects.
 * @returns {string} Pretty-printed JSON string.
 */
export function formatJSON(results) {
  return JSON.stringify(results, null, 2);
}

/**
 * Format scored results as CSV with a header row.
 * @param {object[]} results - Array of scored result objects.
 * @returns {string} CSV string.
 */
export function formatCSV(results) {
  const headers = [
    'account_id',
    'company_name',
    'score',
    'tier',
    'tier_action',
    'confidence_rating',
    'confidence_pct',
    'disqualified',
    'disqualification_reasons',
    'missing_fields',
  ];

  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = results.map((r) =>
    [
      escapeCSV(r.accountId),
      escapeCSV(r.companyName),
      escapeCSV(r.totalScore),
      escapeCSV(r.disqualified ? 'disqualified' : (r.tier?.name || '')),
      escapeCSV(r.tier?.action || ''),
      escapeCSV(r.confidence?.rating || ''),
      escapeCSV(r.confidence?.percentage ?? ''),
      escapeCSV(r.disqualified ? 'true' : 'false'),
      escapeCSV((r.disqualificationReasons || []).join('; ')),
      escapeCSV((r.missingFields || []).join('; ')),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Format scored results as a self-contained HTML report.
 * @param {object[]} results - Array of scored result objects.
 * @param {object} profile - The ICP profile definition.
 * @returns {string} HTML string.
 */
export function formatHTML(results, profile) {
  return generateHTMLReport(results, profile);
}

/**
 * Dispatch to the appropriate formatter based on format string.
 * @param {object[]} results - Array of scored result objects.
 * @param {object} profile - The ICP profile definition.
 * @param {string} format - One of 'table', 'json', 'csv', 'html'.
 * @returns {string} Formatted output string.
 */
export function formatOutput(results, profile, format) {
  switch (format) {
    case 'json':
      return formatJSON(results);
    case 'csv':
      return formatCSV(results);
    case 'html':
      return formatHTML(results, profile);
    case 'table':
    default:
      return formatTable(results);
  }
}
