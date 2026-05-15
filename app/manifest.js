import {
  defaultFaviconHref,
  readSiteLogoState,
  siteLogoAssetHref,
  siteLogoMimeType,
} from '@/lib/site-logo.server';

export const dynamic = 'force-dynamic';

export default async function manifest() {
  const { logoUrl, updatedAt } = await readSiteLogoState();
  const href = siteLogoAssetHref(logoUrl, updatedAt);
  const icons = href
    ? [
        {
          src: href,
          sizes: 'any',
          type: siteLogoMimeType(logoUrl),
          purpose: 'any',
        },
      ]
    : [
        {
          src: defaultFaviconHref(),
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ];

  return {
    name: 'Base44 News',
    short_name: 'News',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f172a',
    icons,
  };
}
