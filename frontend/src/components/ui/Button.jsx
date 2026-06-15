import { Loader2 } from 'lucide-react'

const BASE = 'inline-flex items-center justify-center gap-2 font-semibold rounded-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'

const VARIANTS = {
  primary:   (tone) => tone === 'port'
    ? 'bg-port-600 text-white hover:bg-port-700 focus-visible:ring-port-500'
    : 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500',
  secondary: () => 'bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:ring-brand-500',
  ghost:     () => 'text-ink-soft hover:bg-slate-100 focus-visible:ring-brand-500',
  danger:    () => 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-400',
}

const SIZES = {
  sm: 'text-xs px-3 py-1.5 h-7',
  md: 'text-sm px-4 py-2 h-9',
  lg: 'text-sm px-5 py-2.5 h-10',
}

export default function Button({
  children,
  variant = 'primary',
  tone = 'brand',
  size = 'md',
  loading = false,
  className = '',
  ...props
}) {
  const variantClass = VARIANTS[variant]?.(tone) ?? VARIANTS.primary(tone)
  const sizeClass = SIZES[size] ?? SIZES.md
  return (
    <button
      className={`${BASE} ${variantClass} ${sizeClass} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}
