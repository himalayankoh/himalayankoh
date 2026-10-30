'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PromotionsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/products?view=promotions');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to Product Promotions &amp; Sales...
    </div>
  );
}
