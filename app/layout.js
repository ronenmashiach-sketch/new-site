import { Inter } from 'next/font/google'
import './globals.css'
import dynamicImport from 'next/dynamic'
import { bwThemeInitScript } from '@/lib/theme-storage'

const inter = Inter({ subsets: ['latin'] })

const AuthProvider = dynamicImport(() => import('@/lib/AuthContext').then(mod => mod.AuthProvider), { ssr: false })

export const metadata = {
  title: 'Base44 APP',
  description: 'News app',
}

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bwThemeInitScript }} />
        <link rel="icon" type="image/svg+xml" href="https://base44.com/logo_v2.svg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}