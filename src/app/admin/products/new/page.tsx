'use client';

import React from 'react';
import { CatalogProductEditor } from '@/admin/CatalogAdmin';
import { AppProvider } from '@/App';

export default function AdminProductNewPage() {
  return (
    <div className="w-full">
      <CatalogProductEditor />
    </div>
  );
}
