import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const BBC_SOURCE_KEY = 'bbc';

/** מיפוי ל־DB.csv — אנגלית מכותרת דף הבית/ RSS; he/ar מתרגום. */
export function buildBbcDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flEn = flashers.map((f) => f.title || '');
  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.bbc.com';

  const imageHeadlineEn = imageHeadline || hero.subTitle || hero.title || '';

  return {
    country: 'GB',
    main_headline_en: hero.title || '',
    main_headline_he: titleHe,
    main_headline_ar: titleAr,
    image_headline_en: imageHeadlineEn,
    image_headline_he: hero.subTitleTranslations?.he ?? titleHe,
    image_headline_ar: hero.subTitleTranslations?.ar ?? titleAr,
    image_url: hero.imageUrl || '',
    flashers_en: flEn,
    flashers_he: flHe,
    flashers_ar: flAr,
    source_url: sourceUrl,
  };
}

export async function syncBbcRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(BBC_SOURCE_KEY, patch);
}

