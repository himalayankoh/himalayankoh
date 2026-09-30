import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx('animate-pulse bg-gray-200 rounded', className)}
    />
  );
}

export function SkeletonProductCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md" aria-hidden="true">
      {/* Mirrors ProductCard's 5:4 image box, so the loading grid holds the same
          shape as the real one and nothing shifts when products arrive. */}
      <Skeleton className="aspect-[5/4] w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonProductGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProductCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonOrderCard() {
  return (
    <div className="bg-white rounded-2xl shadow-md p-6" aria-hidden="true">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <Skeleton className="h-3 w-3/4 mb-4" />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <Skeleton className="w-12 h-12 rounded-lg" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

export function SkeletonOrderList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonOrderCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm" aria-hidden="true">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="w-9 h-9 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-28 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Content rows */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <Skeleton className="h-5 w-32 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <Skeleton className="h-5 w-32 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <tr aria-hidden="true">
      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
      <td className="px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
    </tr>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </tbody>
  );
}

function SkeletonSettingsCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" aria-hidden="true">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-5 h-5 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52" />
          </div>
        </div>
        <Skeleton className="w-4 h-4" />
      </div>
      <div className="px-6 pb-5 pt-3 space-y-4 border-t border-gray-100">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3.5 w-32 mb-2" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
        <div className="flex justify-end pt-1">
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonSettings({ count = 4 }: { count?: number }) {
  return (
    <div className="max-w-3xl mx-auto space-y-6" aria-hidden="true">
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonSettingsCard key={i} />
      ))}
    </div>
  );
}
