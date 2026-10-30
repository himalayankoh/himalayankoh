'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function VariantGenRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/products');
  }, [router]);

  return (
    <div className="p-8 text-center text-sm text-gray-500">
      Redirecting to Products...
    </div>
  );
}
