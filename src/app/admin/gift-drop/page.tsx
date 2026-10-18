'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GiftDropRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/coupons');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to Coupons &amp; Promotions...
    </div>
  );
}
