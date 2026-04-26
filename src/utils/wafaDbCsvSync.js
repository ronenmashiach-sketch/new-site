import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const WAFA_SOURCE_KEY = 'wafa';

/** מיפוי ל־DB.csv — ערבית מ־www.wafa.ps, עברית מ־hebrew.wafa.ps, אנגלית מ־english.wafa.ps (ללא תרגום מכונה). */
export function buildWafaDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleEn = (titleTranslations.en && String(titleTranslations.en).trim()) || '';

  const subAr = hero.subTitle || '';
  const subHe = hero.subTitleTranslations?.he ?? '';
  const subEn = (hero.subTitleTranslations?.en && String(hero.subTitleTranslations.en).trim()) || '';

  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.title || '');
  const flEn = flashers.map((f) => (f.titleTranslations?.en && String(f.titleTranslations.en).trim()) || '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.wafa.ps';

  const imageHeadlineAr = imageHeadline || subAr || hero.title || '';

  return {
    country: 'PS',
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

export async function syncWafaRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(WAFA_SOURCE_KEY, patch);
}
