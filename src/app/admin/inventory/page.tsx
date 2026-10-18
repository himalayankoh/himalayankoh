'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InventoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/products?view=inventory');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to Products Inventory &amp; Stock...
    </div>
  );
}
