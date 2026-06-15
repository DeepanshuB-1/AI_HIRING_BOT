export default function Card({ children, className = '', header = null }) {
  return (
    <div className={`bg-white rounded-card shadow-card border border-slate-100 ${className}`}>
      {header && (
        <div className="px-5 py-4 border-b border-slate-100">
          {header}
        </div>
      )}
      {children}
    </div>
  )
}
