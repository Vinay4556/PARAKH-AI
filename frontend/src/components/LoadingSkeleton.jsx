import React from 'react'

export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />
}

export function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3">
      <SkeletonLine width="w-1/3" height="h-3" />
      <SkeletonLine width="w-full" height="h-6" />
      <SkeletonLine width="w-2/3" height="h-3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3 bg-white rounded border border-gray-100">
          <SkeletonLine width="w-20" height="h-4" />
          <SkeletonLine width="flex-1" height="h-4" />
          <SkeletonLine width="w-24" height="h-4" />
          <SkeletonLine width="w-20" height="h-4" />
        </div>
      ))}
    </div>
  )
}

export function PageLoader() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '240px' }}
      role="status"
      aria-label="Loading page"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 border-2 border-blue-700 border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-400 font-medium">Loading…</p>
      </div>
    </div>
  )
}

// ── Route-level skeleton shown while a lazy chunk is downloading ──
// Matches the rough shape of most pages so there's no layout shift.
export function RouteLoader() {
  return (
    <div className="p-6 space-y-4 max-w-4xl animate-pulse" aria-hidden="true">
      {/* Page title */}
      <div className="h-6 w-48 bg-gray-200 rounded" />
      <div className="h-3 w-72 bg-gray-100 rounded" />
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl border border-gray-100" />
        ))}
      </div>
      {/* Card body */}
      <div className="h-48 bg-gray-50 rounded-xl border border-gray-100" />
      <div className="h-32 bg-gray-50 rounded-xl border border-gray-100" />
    </div>
  )
}
