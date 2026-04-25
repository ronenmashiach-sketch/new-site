import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const JORDAN_TIMES_SOURCE_KEY = 'jordan_times';

/**
 * מיפוי שדות ל־DB.csv עבור Jordan Times (מקור באנגלית; תרגום ל־he/ar).
 * שומר headline באנגלית ב־main_headline_en וב־image_headline_en.
 */
export function buildJordanTimesDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {} }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flEn = flashers.map((f) => f.title || '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://jordantimes.com';

  return {
    country: 'JO',
    main_headline_he: titleHe,
    main_headline_en: hero.title || '',
    main_headline_ar: titleAr,
    image_headline_he: titleHe,
    image_headline_en: hero.title || '',
    image_headline_ar: titleAr,
    image_url: hero.imageUrl || '',
    flashers_he: flHe,
    flashers_en: flEn,
    flashers_ar: flAr,
    source_url: sourceUrl,
  };
}

export async function syncJordanTimesRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(JORDAN_TIMES_SOURCE_KEY, patch);
}

