import { Inter } from 'next/font/google'
import './globals.css'
import dynamicImport from 'next/dynamic'
import { bwThemeInitScript } from '@/lib/theme-storage'
import {
  defaultFaviconHref,
  readSiteLogoState,
  siteLogoAssetHref,
  siteLogoMimeType,
} from '@/lib/site-logo.server'
import { readSiteBranding } from '@/lib/site-branding.server'

const inter = Inter({ subsets: ['latin'] })

const AuthProvider = dynamicImport(() => import('@/lib/AuthContext').then(mod => mod.AuthProvider), { ssr: false })

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const branding = await readSiteBranding();
  const pageTitle =
    (branding.siteTitleHtml && branding.siteTitleHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) ||
    branding.siteTitle?.text?.trim() ||
    'Base44 APP';

  const { logoUrl, updatedAt } = await readSiteLogoState();
  const href = siteLogoAssetHref(logoUrl, updatedAt);
  if (!href) {
    return {
      title: pageTitle,
      description: 'News app',
      icons: {
        icon: [{ url: defaultFaviconHref(), type: 'image/svg+xml' }],
        apple: [{ url: defaultFaviconHref(), type: 'image/svg+xml' }],
      },
    };
  }
  const type = siteLogoMimeType(logoUrl);
  return {
    title: pageTitle,
    description: 'News app',
    icons: {
      icon: [{ url: href, type }],
      apple: [{ url: href, type }],
      shortcut: [{ url: href, type }],
    },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bwThemeInitScript }} />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}