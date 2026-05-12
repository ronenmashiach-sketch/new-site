import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AdminIconView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">אייקון</h1>
        <p className="text-sm text-muted-foreground">העלאה או החלפת אייקון / פאביקון (יתווסף בהמשך).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>אסט</CardTitle>
          <CardDescription>כאן יוצגו אפשרויות להעלאת קובץ תמונה ותצוגה מקדימה.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">מקום שמור ללוגיקת העלאה ואחסון.</p>
        </CardContent>
      </Card>
    </div>
  );
}
