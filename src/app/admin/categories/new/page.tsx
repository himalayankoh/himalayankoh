'use client';

import React from 'react';
import AdminCategories from '@/views/admin/AdminCategories';

export default function AdminCategoryNewPage() {
  return (
    <div className="w-full">
      <AdminCategories initialNew={true} />
    </div>
  );
}
