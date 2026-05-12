import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminTextsView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">טקסטים</h1>
        <p className="text-sm text-muted-foreground">עריכת טקסטים באתר (יתווסף בהמשך).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>תוכן</CardTitle>
          <CardDescription>כאן יופיעו שדות או טבלה לניהול טקסטים.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">מקום שמור לטופסים ולשמירה לשרת.</p>
        </CardContent>
      </Card>
    </div>
  );
}
