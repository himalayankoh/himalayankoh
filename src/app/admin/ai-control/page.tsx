'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AiControlRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/settings?tab=ai-providers');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to Settings &amp; AI Providers...
    </div>
  );
}
