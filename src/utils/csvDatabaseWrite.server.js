/**
 * כתיבת DB.csv — רק בשרת (מודול .server.js). לא לייבא מקומפוננטות לקוח.
 * UTF-8 עם BOM כדי ש־Excel / דפדפנים יזהו עברית/ערבית נכון.
 */
import { writeFile } from 'fs/promises';
import { join } from 'path';

import { loadCSVData, objectsToCSV } from './csvDatabase';

const UTF8_BOM = '\uFEFF';

function getDbFilePathSync() {
  return join(process.cwd(), 'data', 'DB.csv');
}

export async function persistDbCsvData(rows) {
  const p = getDbFilePathSync();
  const body = objectsToCSV(rows);
  const csv = body.startsWith(UTF8_BOM) ? body : `${UTF8_BOM}${body}`;
  await writeFile(p, csv, { encoding: 'utf8' });
  return true;
}

export async function updateDbCsvRowBySourceKey(sourceKey, updates) {
  const key = String(sourceKey || '').trim().toLowerCase();
  const data = await loadCSVData();
  const idx = data.findIndex((r) => String(r.source_key || '').trim().toLowerCase() === key);
  if (idx === -1) {
    throw new Error(`לא נמצאה שורה עם source_key="${sourceKey}" ב-DB.csv`);
  }
  const now = new Date().toISOString();
  data[idx] = {
    ...data[idx],
    ...updates,
    last_fetched: now,
    updated_date: now,
  };
  await persistDbCsvData(data);
  return data[idx];
}
