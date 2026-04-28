import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const FOX_SOURCE_KEY = 'foxnews';

/** מיפוי ל־DB.csv — אנגלית מכותרת דף הבית/ RSS; he/ar מתרגום. */
export function buildFoxDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flEn = flashers.map((f) => f.title || '');
  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.foxnews.com';

  const imageHeadlineEn = imageHeadline || hero.subTitle || hero.title || '';

  return {
    country: 'US',
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

export async function syncFoxRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(FOX_SOURCE_KEY, patch);
}

