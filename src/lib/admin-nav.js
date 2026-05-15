import { FileText, Image, ListOrdered } from 'lucide-react';

export const ADMIN_NAV_ITEMS = [
  { href: '/admin/dashboard/texts', label: 'טקסטים', icon: FileText },
  { href: '/admin/dashboard/icon', label: 'לוגו', icon: Image },
  { href: '/admin/dashboard/articles', label: 'סידור כתבות', icon: ListOrdered },
];
