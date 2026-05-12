import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminArticlesView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">סידור כתבות</h1>
        <p className="text-sm text-muted-foreground">גרירה וסידור סדר הופעה של כתבות (יתווסף בהמשך).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>רשימה</CardTitle>
          <CardDescription>כאן תופיע רשימת כתבות עם אפשרות לשנות סדר.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">מקום שמור ל־DND או כפתורי למעלה / למטה.</p>
        </CardContent>
      </Card>
    </div>
  );
}
