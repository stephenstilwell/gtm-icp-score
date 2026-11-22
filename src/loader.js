/**
 * Profile & data loading — YAML/JSON/CSV parsing
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

/**
 * Parse CSV text into an array of objects
 * Handles quoted fields, commas within quotes, and newlines within quotes
 * @param {string} text - CSV content
 * @returns {Array<object>}
 */
export function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  // Split into lines, handling quoted newlines
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      current += '"';
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i++; // skip \r\n
      }
      if (current.trim()) {
        lines.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].trim();
      let val = j < values.length ? values[j] : '';

      // Auto-convert numeric values
      if (val !== '' && !isNaN(Number(val)) && val.trim() !== '') {
        // But keep dates and IDs as strings
        if (!key.includes('date') && !key.includes('id') && !key.includes('_id')) {
          val = Number(val);
        }
      }

      // Convert boolean strings
      if (val === 'true') val = true;
      else if (val === 'false') val = false;

      obj[key] = val === '' ? null : val;
    }
    results.push(obj);
  }

  return results;
}

/**
 * Parse a single CSV line into fields
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);

  return fields;
}

/**
 * Load an ICP profile from a YAML or JSON file
 * @param {string} filePath - path to the profile file
 * @returns {object} parsed profile
 */
export async function loadProfile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const ext = extname(filePath).toLowerCase();

  if (ext === '.json') {
    return JSON.parse(content);
  }

  if (ext === '.yaml' || ext === '.yml') {
    // Use the yaml npm package
    const yamlModule = await import('yaml');
    const parse = yamlModule.default?.parse || yamlModule.parse;
    return parse(content);
  }

  throw new Error(`Unsupported profile format: ${ext}. Use .yaml, .yml, or .json`);
}

/**
 * Load account data from a CSV or JSON file
 * @param {string} filePath - path to the data file, or '-' for stdin
 * @returns {Promise<Array<object>>} array of account objects
 */
export async function loadAccounts(filePath) {
  let content;

  if (filePath === '-') {
    // Read from stdin
    content = await readStdin();
  } else {
    content = readFileSync(filePath, 'utf-8');
  }

  const ext = filePath === '-' ? detectFormat(content) : extname(filePath).toLowerCase();

  if (ext === '.json') {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  }

  if (ext === '.csv') {
    return parseCSV(content);
  }

  // Try JSON first, then CSV
  try {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [data];
  } catch {
    return parseCSV(content);
  }
}

/**
 * Read all data from stdin
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Detect format from content (for stdin)
 * @param {string} content
 * @returns {string} extension like '.json' or '.csv'
 */
function detectFormat(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return '.json';
  }
  return '.csv';
}

/**
 * Load profile from a string (for testing / library use)
 * @param {string} content - YAML or JSON string
 * @param {string} [format='yaml'] - 'yaml' or 'json'
 * @returns {object}
 */
export async function parseProfile(content, format = 'yaml') {
  if (format === 'json') {
    return JSON.parse(content);
  }
  const yamlModule = await import('yaml');
  const parse = yamlModule.default?.parse || yamlModule.parse;
  return parse(content);
}
