// CSV "database": file at data/DB.csv. קריאה בדפדפן ובשרת; כתיבה לדיסק מ־`csvDatabaseWrite.server.js` (GET `/api/ynet`, `/api/maariv` או `/api/walla`).
const CSV_API_PATH = '/api/csv';

/** Stable column order (matches Base44 / NewsSource export). */
export const CSV_COLUMN_ORDER = [
  'country',
  'main_headline_he',
  'image_headline_en',
  'image_url',
  'flashers_he',
  'image_headline_ar',
  'source_url',
  'main_headline_en',
  'image_headline_he',
  'main_headline_ar',
  'flashers_ar',
  'source_key',
  'source_name',
  'flashers_en',
  'last_fetched',
  'id',
  'created_date',
  'updated_date',
  'created_by_id',
  'created_by',
  'is_sample',
];

async function getDbFilePath() {
  const { join } = await import('path');
  return join(process.cwd(), 'data', 'DB.csv');
}

/**
 * Split CSV into row strings without breaking inside quoted fields (handles newlines in cells).
 */
function splitCSVRows(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += '"';
      continue;
    }
    if (ch === '\n' && !inQuotes) {
      rows.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  rows.push(cur);
  while (rows.length && rows[rows.length - 1] === '') {
    rows.pop();
  }
  return rows;
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function collectHeaders(allRows) {
  const extra = new Set();
  allRows.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (!CSV_COLUMN_ORDER.includes(k)) extra.add(k);
    });
  });
  const ordered = CSV_COLUMN_ORDER.filter((h) =>
    allRows.some((r) => Object.prototype.hasOwnProperty.call(r, h))
  );
  return [...ordered, ...[...extra].sort()];
}

/** RFC-style: quote only when needed (fewer " than wrapping every cell). */
function serializeCell(header, raw) {
  let value;
  if (
    (header === 'flashers_he' || header === 'flashers_ar' || header === 'flashers_en') &&
    Array.isArray(raw)
  ) {
    value = JSON.stringify(raw);
  } else if (typeof raw === 'boolean') {
    value = raw ? 'true' : 'false';
  } else if (raw === null || raw === undefined) {
    value = '';
  } else {
    value = String(raw);
  }

  const needsQuotes =
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ');

  const escaped = value.replace(/"/g, '""');
  if (needsQuotes) {
    return `"${escaped}"`;
  }
  return escaped;
}

// Convert array of objects to CSV string (exported for tests / tooling)
export function objectsToCSV(data) {
  if (!data || data.length === 0) return '';

  const headers = collectHeaders(data);
  const headerLine = headers.join(',');
  const lines = [headerLine];

  data.forEach((row) => {
    lines.push(headers.map((h) => serializeCell(h, row[h])).join(','));
  });

  return lines.join('\n');
}

// Parse CSV string to array of objects (exported for tests / tooling)
export function parseCSV(csvText) {
  const normalized = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  const rowStrings = splitCSVRows(normalized).filter((r) => r.length > 0);
  if (rowStrings.length < 2) return [];

  const headers = parseCSVLine(rowStrings[0]);
  const data = [];

  for (let i = 1; i < rowStrings.length; i++) {
    const values = parseCSVLine(rowStrings[i]);
    const row = {};
    headers.forEach((header, index) => {
      const raw = values[index] ?? '';
      const isFlasher =
        header === 'flashers_he' || header === 'flashers_ar' || header === 'flashers_en';
      let cell;
      if (isFlasher && raw) {
        try {
          cell = JSON.parse(raw);
        } catch {
          cell = [];
        }
      } else if (header === 'is_sample' && typeof raw === 'string') {
        cell = raw === 'true' || raw === '1';
      } else {
        cell = raw;
      }
      row[header] = cell;
    });
    data.push(row);
  }
  return data;
}

// Load CSV data from file
export async function loadCSVData() {
  if (typeof window === 'undefined') {
    try {
      const { readFile } = await import('fs/promises');
      const p = await getDbFilePath();
      const csvText = await readFile(p, 'utf8');
      return parseCSV(csvText);
    } catch (e) {
      if (e && e.code === 'ENOENT') return [];
      console.error('Error loading CSV from disk:', e);
      return [];
    }
  }
  try {
    const response = await fetch(CSV_API_PATH);
    if (!response.ok) {
      throw new Error(`Failed to load CSV: ${response.statusText}`);
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error loading CSV:', error);
    return [];
  }
}

/**
 * create/update בקוד ישן קוראים לכאן — נשאר no-op. כתיבה ל־CSV: `csvDatabaseWrite.server.js`.
 */
export async function saveCSVData(_data) {
  return true;
}

// List all records (optionally sorted)
export async function listNewsSource(sortBy = '-updated_date', limit = 50) {
  const data = await loadCSVData();

  if (sortBy) {
    const isDescending = sortBy.startsWith('-');
    const field = isDescending ? sortBy.substring(1) : sortBy;

    data.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal < bVal) return isDescending ? 1 : -1;
      if (aVal > bVal) return isDescending ? -1 : 1;
      return 0;
    });
  }

  return data.slice(0, limit);
}

// Filter records
export async function filterNewsSource(conditions, sortBy = '-created_date', limit = 1) {
  let data = await loadCSVData();

  data = data.filter((row) => {
    return Object.keys(conditions).every((key) => row[key] === conditions[key]);
  });

  if (sortBy) {
    const isDescending = sortBy.startsWith('-');
    const field = isDescending ? sortBy.substring(1) : sortBy;

    data.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal < bVal) return isDescending ? 1 : -1;
      if (aVal > bVal) return isDescending ? -1 : 1;
      return 0;
    });
  }

  return data.slice(0, limit);
}

// Create a new record
export async function createNewsSource(data) {
  const allData = await loadCSVData();

  if (!data.id) {
    data.id = Math.random().toString(36).substring(2, 15);
  }

  if (!data.created_date) {
    data.created_date = new Date().toISOString();
  }
  if (!data.updated_date) {
    data.updated_date = new Date().toISOString();
  }

  allData.push(data);
  await saveCSVData(allData);
  return data;
}

// Update an existing record
export async function updateNewsSource(id, updates) {
  const allData = await loadCSVData();
  const index = allData.findIndex((row) => row.id === id);

  if (index === -1) {
    throw new Error(`Record with id ${id} not found`);
  }

  allData[index] = {
    ...allData[index],
    ...updates,
    updated_date: new Date().toISOString(),
  };

  await saveCSVData(allData);
  return allData[index];
}

// Find a record by ID
export async function getNewsSourceById(id) {
  const data = await loadCSVData();
  return data.find((row) => row.id === id);
}

// Find a record by source_key
export async function getNewsSourceByKey(sourceKey) {
  const data = await loadCSVData();
  return data.find((row) => row.source_key === sourceKey);
}

// Export as mock base44 entities for compatibility
export const NewsSourceEntity = {
  list: listNewsSource,
  filter: filterNewsSource,
  create: createNewsSource,
  update: updateNewsSource,
  getById: getNewsSourceById,
  getByKey: getNewsSourceByKey,
};
