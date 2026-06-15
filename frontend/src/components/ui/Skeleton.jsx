export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-100 rounded-lg ${className}`} />
}

export function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-4"><Skeleton className="w-4 h-4 rounded" /></td>
      <td className="px-5 py-4">
        <Skeleton className="h-4 w-32 mb-1.5" />
        <Skeleton className="h-3 w-24" />
      </td>
      <td className="px-5 py-4"><Skeleton className="h-5 w-20 rounded-pill" /></td>
      <td className="px-5 py-4"><Skeleton className="h-3 w-16" /></td>
      <td className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-pill" /></td>
      <td className="px-5 py-4"><Skeleton className="h-3 w-20" /></td>
      <td className="px-5 py-4"><Skeleton className="h-3 w-12" /></td>
    </tr>
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white rounded-card shadow-card border border-slate-100 p-5 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
