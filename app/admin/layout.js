export const metadata = {
  title: 'מנהל',
  description: 'כניסת מנהלים',
};

export default function AdminLayout({ children }) {
  return (
    <div dir="rtl" lang="he" className="min-h-dvh bg-background font-hebrew text-foreground antialiased">
      {children}
    </div>
  );
}
