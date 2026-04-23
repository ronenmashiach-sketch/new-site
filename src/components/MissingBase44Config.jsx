'use client'

import React from 'react'

/**
 * Shown when appId is missing or invalid (e.g. old placeholder "your-app-id").
 * Base44 requires a real app id from the dashboard or from a hosted app URL.
 */
export default function MissingBase44Config() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-lg w-full rounded-lg border border-border bg-card p-6 shadow-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold text-foreground">הגדרת Base44 חסרה</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          הופעל חיבור ל-Base44 עם מזהה לא תקין (למשל placeholder). בלי Base44 האפליקציה רצה עצמאית — רק אם מוסיפים{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">appId</code> ב-URL או ב-env, צריך מזהה אמיתי מהמסוף.
        </p>
        <ol className="text-sm text-left text-muted-foreground space-y-2 list-decimal list-inside rtl:text-right">
          <li>
            תקנו את המזהה ב-<code className="rounded bg-muted px-1 text-xs">.env.local</code>:{' '}
            <code className="block mt-1 rounded bg-muted p-2 text-xs break-all" dir="ltr">
              NEXT_PUBLIC_BASE44_APP_ID=המזהה_הנכון
            </code>
          </li>
          <li>
            או:{' '}
            <code className="rounded bg-muted px-1 text-xs break-all" dir="ltr">
              http://localhost:3000/?appId=המזהה_הנכון
            </code>
          </li>
          <li>להסרת מזהה שגוי מ-localStorage — נקו אחסון האתר או הסירו את פרמטרי ה-URL.</li>
        </ol>
      </div>
    </div>
  )
}
