'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ScoutRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/leados');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to LeadOS...
    </div>
  );
}
