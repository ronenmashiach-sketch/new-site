/**
 * נתיבי GET שמעדכנים חדשות (סקרייפ/RSS + סנכרון DB.csv).
 * הסדר כאן הוא סדר הקריאות ב-cron — אחד אחרי השני.
 */
export const NEWS_REFRESH_ENDPOINTS = [
  { id: 'ynet', path: '/api/ynet' },
  { id: 'maariv', path: '/api/maariv' },
  { id: 'israelhayom', path: '/api/israelhayom' },
  { id: 'walla', path: '/api/walla' },
  { id: 'hurriyet', path: '/api/hurriyet' },
  { id: 'jordantimes', path: '/api/jordantimes' },
  { id: 'ahram', path: '/api/ahram' },
  { id: 'aawsat', path: '/api/aawsat' },
  { id: 'national', path: '/api/national' },
  { id: 'gulfnews', path: '/api/gulfnews' },
  { id: 'bna', path: '/api/bna' },
  { id: 'moroccoworldnews', path: '/api/moroccoworldnews' },
  { id: 'sana', path: '/api/sana' },
  { id: 'wafa', path: '/api/wafa' },
  { id: 'cnn', path: '/api/cnn' },
  { id: 'bbc', path: '/api/bbc' },
  { id: 'foxnews', path: '/api/foxnews' },
];
