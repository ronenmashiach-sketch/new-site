import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const ISRAELHAYOM_SOURCE_KEY = 'israelhayom';

/** מיפוי שדות כמו walla / ynet ל־DB.csv */
export function buildIsraelHayomDbCsvUpdates({
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
  if (!sourceUrl) sourceUrl = 'https://www.israelhayom.co.il';

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

export async function syncIsraelHayomRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(ISRAELHAYOM_SOURCE_KEY, patch);
}
