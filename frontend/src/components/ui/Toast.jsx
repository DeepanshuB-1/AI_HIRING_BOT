import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

let _nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts(ts => ts.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback((message, type = 'success', duration = 4000) => {
    const id = ++_nextId
    setToasts(ts => [...ts, { id, message, type }])
    timers.current[id] = setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 max-w-xs w-full">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-card shadow-pop text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
              t.type === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-white border border-slate-200 text-ink'
            }`}>
            {t.type === 'error'
              ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
            }
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
