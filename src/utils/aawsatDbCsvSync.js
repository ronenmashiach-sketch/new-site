import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const AAWSAT_SOURCE_KEY = 'aawsat';

/** מיפוי ל־DB.csv — מקור בערבית, תרגום ל־he/en. */
export function buildAawsatDbCsvUpdates({
  hero,
  flashers,
  homeUrl,
  titleTranslations = {},
  imageHeadline = '',
}) {
  const titleHe = titleTranslations.he ?? '';
  const titleEn = titleTranslations.en ?? '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.title || '');
  const flEn = flashers.map((f) => f.titleTranslations?.en ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://aawsat.com';

  const imageHeadlineAr = imageHeadline || hero.title || '';

  return {
    country: 'SA',
    main_headline_he: titleHe,
    main_headline_en: titleEn,
    main_headline_ar: hero.title || '',
    image_headline_he: titleHe,
    image_headline_en: titleEn,
    image_headline_ar: imageHeadlineAr,
    image_url: hero.imageUrl || '',
    flashers_he: flHe,
    flashers_en: flEn,
    flashers_ar: flAr,
    source_url: sourceUrl,
  };
}

export async function syncAawsatRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(AAWSAT_SOURCE_KEY, patch);
}
