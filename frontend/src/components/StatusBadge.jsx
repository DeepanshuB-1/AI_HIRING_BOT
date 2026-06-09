const config = {
  pending:        { label: 'Pending',     cls: 'bg-slate-100 text-slate-600',    dot: 'bg-slate-400'   },
  analyzed:       { label: 'Analyzed',    cls: 'bg-blue-50 text-blue-700',       dot: 'bg-blue-500'    },
  pending_review: { label: 'In Review',   cls: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500'   },
  scheduled:      { label: 'Scheduled',   cls: 'bg-violet-50 text-violet-700',   dot: 'bg-violet-500'  },
  in_call:        { label: 'In Call',     cls: 'bg-orange-50 text-orange-700',   dot: 'bg-orange-500 animate-pulse' },
  completed:      { label: 'Completed',   cls: 'bg-green-50 text-green-700',     dot: 'bg-green-500'   },
  rejected:       { label: 'Rejected',    cls: 'bg-red-50 text-red-600',         dot: 'bg-red-400'     },
  failed:         { label: 'Failed',      cls: 'bg-slate-100 text-slate-500',    dot: 'bg-slate-400'   },
  dialing:        { label: 'Dialing',     cls: 'bg-orange-50 text-orange-700',   dot: 'bg-orange-500 animate-pulse' },
  no_answer:      { label: 'No Answer',   cls: 'bg-slate-100 text-slate-500',    dot: 'bg-slate-400'   },
}

export default function StatusBadge({ status }) {
  const { label, cls, dot } = config[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  )
}
