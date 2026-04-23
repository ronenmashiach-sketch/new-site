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

    if (source.key === 'ynet') {
      const ynetCfg = await getYnetUrlConfig();
      if (ynetCfg.rssUrl) rssUrl = ynetCfg.rssUrl;
      if (ynetCfg.siteUrl) siteUrl = ynetCfg.siteUrl;
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

    // For flashers, we'll take the next few headlines
    const flashers = newsItems.slice(1, 6).map(item => item.title);

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