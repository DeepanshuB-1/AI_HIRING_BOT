import PortalNav from './PortalNav'

export default function PortalLayout({ children, wide = false }) {
  return (
    <div className="min-h-screen bg-canvas-portal">
      <PortalNav />
      <main className={`mx-auto px-6 py-8 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {children}
      </main>
      <footer className="border-t border-slate-200 py-6 text-center mt-10">
        <p className="text-xs text-ink-faint">
          Powered by <span className="font-medium text-port-600">HiringBot</span> · Screening interviews are conducted by an AI system
        </p>
      </footer>
    </div>
  )
}
