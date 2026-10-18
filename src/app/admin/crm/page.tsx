'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CRMRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/leados?tab=library&source=crm');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to LeadOS CRM &amp; Prospects...
    </div>
  );
}
