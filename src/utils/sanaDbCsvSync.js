import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const SANA_SOURCE_KEY = 'sana';

/** מיפוי ל־DB.csv — ערבית מ־sana.sy, אנגלית מ־sana.sy/en, עברית מתרגום. */
export function buildSanaDbCsvUpdates({
  hero,
  flashers,
  homeUrl,
  titleTranslations = {},
  imageHeadline = '',
}) {
  const titleHe = titleTranslations.he ?? '';
  const titleEn = (titleTranslations.en && String(titleTranslations.en).trim()) || '';

  const subAr = hero.subTitle || '';
  const subHe = hero.subTitleTranslations?.he ?? '';
  const subEn = (hero.subTitleTranslations?.en && String(hero.subTitleTranslations.en).trim()) || '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.title || '');
  const flEn = flashers.map((f) => {
    const e = (f.titleTranslations?.en && String(f.titleTranslations.en).trim()) || '';
    return e;
  });

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://sana.sy';

  const imageHeadlineAr = imageHeadline || subAr || hero.title || '';

  return {
    country: 'SY',
    main_headline_ar: hero.title || '',
    main_headline_he: titleHe,
    main_headline_en: titleEn,
    image_headline_ar: imageHeadlineAr,
    image_headline_he: subHe,
    image_headline_en: subEn,
    image_url: hero.imageUrl || '',
    flashers_ar: flAr,
    flashers_he: flHe,
    flashers_en: flEn,
    source_url: sourceUrl,
  };
}

export async function syncSanaRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(SANA_SOURCE_KEY, patch);
}
