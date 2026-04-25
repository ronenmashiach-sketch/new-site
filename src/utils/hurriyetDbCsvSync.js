import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const HURRIYET_SOURCE_KEY = 'hurriyet';

/** מיפוי שדות ל־DB.csv עבור מקור באנגלית (תרגום ל־he/ar). */
export function buildHurriyetDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flEn = flashers.map((f) => f.title || '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.hurriyetdailynews.com';

  const imageHeadlineEn = imageHeadline || hero.title || '';

  return {
    country: 'TR',
    main_headline_he: titleHe,
    main_headline_en: hero.title || '',
    main_headline_ar: titleAr,
    image_headline_he: titleHe,
    image_headline_en: imageHeadlineEn,
    image_headline_ar: titleAr,
    image_url: hero.imageUrl || '',
    flashers_he: flHe,
    flashers_en: flEn,
    flashers_ar: flAr,
    source_url: sourceUrl,
  };
}

export async function syncHurriyetRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(HURRIYET_SOURCE_KEY, patch);
}

