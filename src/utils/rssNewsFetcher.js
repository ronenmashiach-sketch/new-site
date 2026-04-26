import { getYnetUrlConfig } from '@/lib/ynetUrlConfig';

// RSS-based news fetching utility - replaces LLM with RSS feeds
const RSS_FEEDS = {
  // BBC feeds
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
  cnn: 'https://rss.cnn.com/rss/edition.rss',

  // Israeli news sources - we'll need to find their RSS feeds
  ynet: 'https://www.ynet.co.il/Integration/StoryRss2.xml', // Example - need to verify
  maariv: 'https://www.maariv.co.il/Rss/', // Example - need to verify
  israelhayom: 'https://www.israelhayom.co.il/rss.xml', // Example - need to verify
  walla: 'https://rss.walla.co.il/feed/1', // Example - need to verify
};

// Parse RSS XML to JSON
function parseRSSXML(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const items = xmlDoc.querySelectorAll('item');
  const newsItems = [];

  items.forEach(item => {
    const title = item.querySelector('title')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const thumbnail = item.querySelector('media\\:thumbnail')?.getAttribute('url') || '';

    newsItems.push({
      title: cleanHTML(title),
      description: cleanHTML(description),
      link,
      pubDate,
      thumbnail
    });
  });

  return newsItems;
}

// Clean HTML entities and tags
function cleanHTML(text) {
  if (!text) return '';

  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Get RSS feed URL for a source
function getRSSFeedURL(sourceKey) {
  return RSS_FEEDS[sourceKey];
}

/** מיפוי תשובת `/api/ahram` או `buildAhramNewsPayload` לשורת נתונים ל־NewsCard. */
function mapAawsatBundleToNewsRow(j, source) {
  const h = j.hero;
  const ar = h.title;
  const he = h.titleTranslations?.he ?? ar;
  const en = h.titleTranslations?.en ?? '';
  const subAr = h.subTitle || '';
  const subHe = h.subTitleTranslations?.he ?? '';
  const subEn = h.subTitleTranslations?.en ?? '';
  return {
    main_headline_ar: ar,
    main_headline_he: he,
    main_headline_en: en,
    image_headline_ar: subAr,
    image_headline_he: subHe || he,
    image_headline_en: subEn || en,
    image_url: h.imageUrl || null,
    flashers_ar: j.flashers.map((f) => f.title),
    flashers_he: j.flashers.map((f) => f.titleTranslations?.he ?? f.title),
    flashers_en: j.flashers.map((f) => f.titleTranslations?.en ?? f.title),
    source_key: source.key,
    source_name: source.name,
    source_url: source.url,
    country: source.country,
    last_fetched: new Date().toISOString(),
  };
}

function mapNationalBundleToNewsRow(j, source) {
  const h = j.hero;
  const he = h.titleTranslations?.he ?? h.title;
  const ar = h.titleTranslations?.ar ?? h.title;
  const subEn = h.subTitle || '';
  const subHe = h.subTitleTranslations?.he ?? '';
  const subAr = h.subTitleTranslations?.ar ?? '';
  return {
    main_headline_en: h.title,
    main_headline_he: he,
    main_headline_ar: ar,
    image_headline_en: subEn,
    image_headline_he: subHe || he,
    image_headline_ar: subAr || ar,
    image_url: h.imageUrl || null,
    flashers_en: j.flashers.map((f) => f.title),
    flashers_he: j.flashers.map((f) => f.titleTranslations?.he ?? f.title),
    flashers_ar: j.flashers.map((f) => f.titleTranslations?.ar ?? f.title),
    source_key: source.key,
    source_name: source.name,
    source_url: source.url,
    country: source.country,
    last_fetched: new Date().toISOString(),
  };
}

function mapAhramBundleToNewsRow(j, source) {
  const h = j.hero;
  const he = h.titleTranslations?.he ?? h.title;
  const ar = h.titleTranslations?.ar ?? h.title;
  const subHe = h.subTitleTranslations?.he ?? h.subTitle ?? '';
  const subAr = h.subTitleTranslations?.ar ?? h.subTitle ?? '';
  const subEn = h.subTitle || '';
  return {
    main_headline_en: h.title,
    main_headline_he: he,
    main_headline_ar: ar,
    image_headline_en: subEn,
    image_headline_he: subHe || he,
    image_headline_ar: subAr || ar,
    image_url: h.imageUrl || null,
    flashers_en: j.flashers.map((f) => f.title),
    flashers_he: j.flashers.map((f) => f.titleTranslations?.he ?? f.title),
    flashers_ar: j.flashers.map((f) => f.titleTranslations?.ar ?? f.title),
    source_key: source.key,
    source_name: source.name,
    source_url: source.url,
    country: source.country,
    last_fetched: new Date().toISOString(),
  };
}

/**
 * In the browser, cross-origin RSS requests are blocked (CORS). Use our API proxy.
 * On the server (e.g. update-news route), fetch the feed directly.
 */
async function fetchRssXmlText(rssUrl) {
  if (typeof window !== 'undefined') {
    const proxyUrl = `/api/rss-proxy?url=${encodeURIComponent(rssUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const j = await response.json();
        if (j.error) detail = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(`RSS proxy: ${detail}`);
    }
    return response.text();
  }

  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`);
  }
  return response.text();
}

// Fetch news from RSS feed
export async function fetchNewsFromRSS(source) {
  try {
    let rssUrl = getRSSFeedURL(source.key);
    let siteUrl = source.url;

    let ynetFlashersRssUrl = '';
    if (source.key === 'ynet') {
      const ynetCfg = await getYnetUrlConfig();
      if (ynetCfg.rssUrl) rssUrl = ynetCfg.rssUrl;
      if (ynetCfg.siteUrl) siteUrl = ynetCfg.siteUrl;
      if (typeof ynetCfg.flashersRssUrl === 'string' && ynetCfg.flashersRssUrl.trim()) {
        ynetFlashersRssUrl = ynetCfg.flashersRssUrl.trim();
      }
    }

    if (source.key === 'national') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/national?translate=he,ar&translateFlashers=1', { cache: 'no-store' });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const errJ = await res.json();
            if (errJ.error) detail = errJ.error;
          } catch {
            /* ignore */
          }
          throw new Error(`National API: ${detail}`);
        }
        const j = await res.json();
        return mapNationalBundleToNewsRow(j, source);
      }
      const { buildNationalNewsPayload } = await import('@/utils/nationalNewsPayload.js');
      const bundle = await buildNationalNewsPayload({
        homeUrl: source.url.endsWith('/') ? source.url : `${source.url}/`,
        flashersLimit: 40,
        translateLangs: ['he', 'ar'],
        translateFlashers: true,
      });
      return mapNationalBundleToNewsRow(bundle, source);
    }

    if (source.key === 'aawsat') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/aawsat?translate=he,en&translateFlashers=1', { cache: 'no-store' });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const errJ = await res.json();
            if (errJ.error) detail = errJ.error;
          } catch {
            /* ignore */
          }
          throw new Error(`Aawsat API: ${detail}`);
        }
        const j = await res.json();
        return mapAawsatBundleToNewsRow(j, source);
      }
      const { buildAawsatNewsPayload } = await import('@/utils/aawsatNewsPayload.js');
      const bundle = await buildAawsatNewsPayload({
        homeUrl: source.url.endsWith('/') ? source.url : `${source.url}/`,
        flashersLimit: 40,
        translateLangs: ['he', 'en'],
        translateFlashers: true,
      });
      return mapAawsatBundleToNewsRow(bundle, source);
    }

    if (source.key === 'ahram') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/ahram?translate=he,ar&translateFlashers=1', { cache: 'no-store' });
        if (!res.ok) {
          let detail = `HTTP ${res.status}`;
          try {
            const errJ = await res.json();
            if (errJ.error) detail = errJ.error;
          } catch {
            /* ignore */
          }
          throw new Error(`Ahram API: ${detail}`);
        }
        const j = await res.json();
        return mapAhramBundleToNewsRow(j, source);
      }
      const { buildAhramNewsPayload } = await import('@/utils/ahramNewsPayload.js');
      const bundle = await buildAhramNewsPayload({
        homeUrl: source.url.endsWith('/') ? source.url : `${source.url}/`,
        flashersLimit: 40,
        translateLangs: ['he', 'ar'],
        translateFlashers: true,
      });
      return mapAhramBundleToNewsRow(bundle, source);
    }

    if (!rssUrl) {
      throw new Error(`No RSS feed found for ${source.name}`);
    }

    const xmlText = await fetchRssXmlText(rssUrl);
    const newsItems = parseRSSXML(xmlText);

    if (newsItems.length === 0) {
      throw new Error(`No news items found in RSS feed for ${source.name}`);
    }

    // Take the first (latest) item
    const latestItem = newsItems[0];

    // Extract main headline from title
    const mainHeadline = latestItem.title;

    // Try to extract secondary headline from description
    const descriptionParts = latestItem.description.split('. ');
    const secondaryHeadline = descriptionParts.length > 1 ? descriptionParts[0] : '';

    // Extract image URL
    const imageUrl = latestItem.thumbnail || null;

    let flashers = newsItems.slice(1, 31).map((item) => item.title);
    if (source.key === 'ynet' && ynetFlashersRssUrl && ynetFlashersRssUrl !== rssUrl) {
      try {
        const flXml = await fetchRssXmlText(ynetFlashersRssUrl);
        const flItems = parseRSSXML(flXml);
        flashers = flItems.slice(0, 40).map((item) => item.title);
      } catch (e) {
        console.warn('ynet flashers RSS failed, falling back to main feed:', e?.message || e);
      }
    }

    return {
      main_headline_he: mainHeadline,
      main_headline_ar: mainHeadline, // Would need translation service
      main_headline_en: mainHeadline, // Would need translation service
      image_headline_he: secondaryHeadline,
      image_headline_ar: secondaryHeadline,
      image_headline_en: secondaryHeadline,
      image_url: imageUrl,
      flashers_he: flashers,
      flashers_ar: flashers, // Would need translation service
      flashers_en: flashers, // Would need translation service
      source_key: source.key,
      source_name: source.name,
      source_url: siteUrl,
      country: source.country,
      last_fetched: new Date().toISOString(),
    };

  } catch (error) {
    console.error(`Failed to fetch news from RSS for ${source.name}:`, error);
    throw error;
  }
}

// Test RSS feed availability
export async function testRSSFeed(sourceKey) {
  try {
    if (sourceKey === 'national') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/national?translate=he,ar', { cache: 'no-store' });
        if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
        const j = await res.json();
        return {
          available: true,
          itemCount: (j.flashers && j.flashers.length) || 0,
          latestTitle: j.hero?.title || 'No title',
        };
      }
      const { buildNationalNewsPayload } = await import('@/utils/nationalNewsPayload.js');
      try {
        const j = await buildNationalNewsPayload({
          flashersLimit: 40,
          translateLangs: ['he', 'ar'],
          translateFlashers: false,
        });
        return {
          available: true,
          itemCount: j.flashers.length,
          latestTitle: j.hero.title || 'No title',
        };
      } catch (e) {
        return { available: false, error: e.message };
      }
    }

    if (sourceKey === 'aawsat') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/aawsat?translate=he,en', { cache: 'no-store' });
        if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
        const j = await res.json();
        return {
          available: true,
          itemCount: (j.flashers && j.flashers.length) || 0,
          latestTitle: j.hero?.title || 'No title',
        };
      }
      const { buildAawsatNewsPayload } = await import('@/utils/aawsatNewsPayload.js');
      try {
        const j = await buildAawsatNewsPayload({
          flashersLimit: 40,
          translateLangs: ['he', 'en'],
          translateFlashers: false,
        });
        return {
          available: true,
          itemCount: j.flashers.length,
          latestTitle: j.hero.title || 'No title',
        };
      } catch (e) {
        return { available: false, error: e.message };
      }
    }

    if (sourceKey === 'ahram') {
      if (typeof window !== 'undefined') {
        const res = await fetch('/api/ahram?translate=he,ar', { cache: 'no-store' });
        if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
        const j = await res.json();
        return {
          available: true,
          itemCount: (j.flashers && j.flashers.length) || 0,
          latestTitle: j.hero?.title || 'No title',
        };
      }
      const { buildAhramNewsPayload } = await import('@/utils/ahramNewsPayload.js');
      const j = await buildAhramNewsPayload({
        flashersLimit: 40,
        translateLangs: ['he', 'ar'],
        translateFlashers: false,
      });
      return {
        available: true,
        itemCount: j.flashers.length,
        latestTitle: j.hero.title || 'No title',
      };
    }

    let rssUrl = getRSSFeedURL(sourceKey);
    if (sourceKey === 'ynet') {
      const ynetCfg = await getYnetUrlConfig();
      if (ynetCfg.rssUrl) rssUrl = ynetCfg.rssUrl;
    }
    if (!rssUrl) {
      return { available: false, error: 'No RSS URL configured' };
    }

    const xmlText = await fetchRssXmlText(rssUrl);
    const newsItems = parseRSSXML(xmlText);

    return {
      available: true,
      itemCount: newsItems.length,
      latestTitle: newsItems[0]?.title || 'No title'
    };

  } catch (error) {
    return { available: false, error: error.message };
  }
}