'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AiIntelligenceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/leados?tab=automation');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to LeadOS Automation...
    </div>
  );
}
