import { updateDbCsvRowBySourceKey } from '@/utils/csvDatabaseWrite.server';

const YNET_SOURCE_KEY = 'ynet';

/**
 * מיפוי ל־DB.csv לפי סדר העמודות בקובץ:
 * - main_* — כותרת השער הראשית (עברית / תרגום).
 * - image_* — טקסט ליד/מתחת לתמונה: כשיש כותרת משנה (slotSubTitle) משתמשים בה + תרגומיה;
 *   אחרת משכפלים את הכותרת הראשית (אותו סיפור כמו התמונה).
 * - flashers_* — מערכים מקבילים של כותרות מבזקים (HE / EN / AR).
 */
export function buildYnetDbCsvUpdates({
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
  if (!sourceUrl) sourceUrl = 'https://www.ynet.co.il';

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

export async function syncYnetRowToDbCsv(patch) {
  return updateDbCsvRowBySourceKey(YNET_SOURCE_KEY, patch);
}
