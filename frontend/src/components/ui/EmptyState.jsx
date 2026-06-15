import Button from './Button'

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  onAction,
  tone = 'brand',
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${tone === 'port' ? 'bg-port-50' : 'bg-brand-50'}`}>
          <Icon className={`w-7 h-7 ${tone === 'port' ? 'text-port-400' : 'text-brand-400'}`} strokeWidth={1.5} />
        </div>
      )}
      <p className="text-sm font-semibold text-ink mb-1">{title}</p>
      {hint && <p className="text-xs text-ink-faint mb-4 max-w-xs leading-relaxed">{hint}</p>}
      {action && onAction && (
        <Button variant="primary" tone={tone} size="sm" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}
