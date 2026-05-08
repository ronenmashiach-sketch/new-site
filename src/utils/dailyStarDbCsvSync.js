import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const DAILY_STAR_SOURCE_KEY = 'daily_star';

export function buildDailyStarDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations = {}, imageHeadline = '' }) {
  const titleHe = titleTranslations.he ?? '';
  const titleAr = titleTranslations.ar ?? '';

  const flEn = flashers.map((f) => f.title || '');
  const flHe = flashers.map((f) => f.titleTranslations?.he ?? '');
  const flAr = flashers.map((f) => f.titleTranslations?.ar ?? '');

  let sourceUrl = (homeUrl || '').trim().split('#')[0];
  if (!sourceUrl) sourceUrl = 'https://www.dailystar.com.lb/';

  const imageHeadlineEn = imageHeadline || hero.subTitle || hero.title || '';

  return {
    country: 'LB',
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

export async function syncDailyStarRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(DAILY_STAR_SOURCE_KEY, patch);
}
