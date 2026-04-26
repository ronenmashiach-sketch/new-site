import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const GULF_SOURCE_KEY = 'gulf_news';

/** מיפוי ל־DB.csv — אנגלית מקור, תרגום ל־he/ar (כמו national). */
export function buildGulfNewsDbCsvUpdates({
  hero,
  flashers,
  homeUrl,
  titleTranslations = {},
  imageHeadline = '',
}) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flEn = flashers.map((f) => f.title || '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://gulfnews.com';

  const imageHeadlineEn = imageHeadline || hero.title || '';

  return {
    country: 'AE',
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

export async function syncGulfNewsRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(GULF_SOURCE_KEY, patch);
}
