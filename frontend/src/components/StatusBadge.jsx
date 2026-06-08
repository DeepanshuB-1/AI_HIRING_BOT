const config = {
  pending:        { label: 'Pending',        cls: 'bg-gray-100 text-gray-600'    },
  analyzed:       { label: 'Analyzed',       cls: 'bg-blue-100 text-blue-700'    },
  pending_review: { label: 'Review',         cls: 'bg-yellow-100 text-yellow-700'},
  scheduled:      { label: 'Scheduled',      cls: 'bg-purple-100 text-purple-700'},
  in_call:        { label: 'In Call',        cls: 'bg-orange-100 text-orange-700'},
  completed:      { label: 'Completed',      cls: 'bg-green-100 text-green-700'  },
  rejected:       { label: 'Rejected',       cls: 'bg-red-100 text-red-600'      },
  failed:         { label: 'Failed',         cls: 'bg-red-100 text-red-600'      },
  // call statuses
  dialing:        { label: 'Dialing',        cls: 'bg-orange-100 text-orange-700'},
  no_answer:      { label: 'No Answer',      cls: 'bg-gray-100 text-gray-600'    },
}

export default function StatusBadge({ status }) {
  const { label, cls } = config[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
