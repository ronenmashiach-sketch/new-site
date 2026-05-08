import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const IRNA_SOURCE_KEY = 'irna';

/** מיפוי ל־DB.csv — אנגלית מכותרת/RSS; he/ar מתרגום. */
export function buildIrnaDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flEn = flashers.map((f) => f.title || '');
  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://en.irna.ir/';

  const imageHeadlineEn = imageHeadline || hero.subTitle || hero.title || '';

  return {
    country: 'IR',
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

export async function syncIrnaRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(IRNA_SOURCE_KEY, patch);
}
