'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CampaignsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/leados?tab=outreach');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to LeadOS Outreach &amp; Campaigns...
    </div>
  );
}
