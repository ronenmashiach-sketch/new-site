import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const WALLA_SOURCE_KEY = 'walla';

/** מיפוי שדות כמו ynet / maariv ל־DB.csv */
export function buildWallaDbCsvUpdates({
  hero,
  flashers,
  homeUrl,
  titleTranslations = {},
  subTitleTranslations = {},
}) {
  const titleEn = titleTranslations.en ?? '';
  const titleAr = titleTranslations.ar ?? '';
  const subHe = (hero.subTitle || '').trim();
  const imageHeadlineHe = subHe || hero.title || '';
  const imageHeadlineEn = subHe ? (subTitleTranslations.en ?? '') : titleEn;
  const imageHeadlineAr = subHe ? (subTitleTranslations.ar ?? '') : titleAr;

  const flHe = flashers.map((f) => f.title || '');
  const flEn = flashers.map((f) => f.titleTranslations?.en ?? '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.walla.co.il';

  return {
    country: 'IL',
    main_headline_he: hero.title || '',
    main_headline_en: titleEn,
    main_headline_ar: titleAr,
    image_headline_he: imageHeadlineHe,
    image_headline_en: imageHeadlineEn,
    image_headline_ar: imageHeadlineAr,
    image_url: hero.imageUrl || '',
    flashers_he: flHe,
    flashers_en: flEn,
    flashers_ar: flAr,
    source_url: sourceUrl,
  };
}

export async function syncWallaRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(WALLA_SOURCE_KEY, patch);
}
