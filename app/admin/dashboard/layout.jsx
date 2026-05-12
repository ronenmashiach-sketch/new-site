import { AdminSessionGate } from '@/components/admin/AdminSessionGate';

export default function AdminDashboardLayout({ children }) {
  return <AdminSessionGate>{children}</AdminSessionGate>;
}
