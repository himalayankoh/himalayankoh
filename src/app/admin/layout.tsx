'use client';

import AdminRoute from '@/components/auth/AdminRoute';
import AdminLayout from '@/components/admin/AdminLayout';
import { AppProvider } from '@/App';
import { MobileThemeProvider } from '@/context/MobileThemeContext';

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <AppProvider>
        <MobileThemeProvider>
          <AdminLayout>{children}</AdminLayout>
        </MobileThemeProvider>
      </AppProvider>
    </AdminRoute>
  );
}

