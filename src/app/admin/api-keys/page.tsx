import { redirect } from 'next/navigation';

/**
 * `/admin/api-keys` used to render the same screen as `/admin/settings`, which
 * put two identical destinations in the rail. Settings and integration keys are
 * one screen (`src/views/admin/AdminSettings.tsx`), so the rail keeps one entry
 * and this route stays as an alias for links and bookmarks made before the
 * duplicate was removed.
 */
export default function AdminApiKeysAliasPage() {
  redirect('/admin/settings');
}
