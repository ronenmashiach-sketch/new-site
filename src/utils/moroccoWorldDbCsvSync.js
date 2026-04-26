import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const MOROCCO_SOURCE_KEY = 'morocco_world';

export function buildMoroccoWorldDbCsvUpdates({
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
  if (!sourceUrl) sourceUrl = 'https://www.moroccoworldnews.com';

  const imageHeadlineEn = imageHeadline || hero.title || '';

  return {
    country: 'MA',
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

export async function syncMoroccoWorldRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(MOROCCO_SOURCE_KEY, patch);
}
