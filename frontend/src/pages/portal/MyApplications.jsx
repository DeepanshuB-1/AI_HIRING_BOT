import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { portalMyApplications, portalWithdraw, portalGetSavedJobs, portalUnsaveJob, portalGetJobs } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'
import EmptyState from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import {
  FileText, Check, Clock, Star, Eye, CalendarCheck,
  Phone, CheckCircle, XCircle, AlertCircle, Briefcase, Lightbulb, Bookmark,
} from 'lucide-react'

// Journey nodes in order
const JOURNEY = [
  { key: 'applied',    label: 'Applied',            icon: FileText,     statuses: ['pending'] },
  { key: 'reviewed',   label: 'AI Resume Review',   icon: Star,         statuses: ['analyzed'] },
  { key: 'shortlisted',label: 'Shortlisted',         icon: Eye,          statuses: ['pending_review'] },
  { key: 'scheduled',  label: 'Interview Scheduled', icon: CalendarCheck,statuses: ['scheduled'] },
  { key: 'in_call',    label: 'Interview Call',      icon: Phone,        statuses: ['in_call'] },
  { key: 'decision',   label: 'Decision',            icon: CheckCircle,  statuses: ['completed', 'rejected', 'failed'] },
]

const STATUS_DESC = {
  pending:        'Your resume is being analyzed by our AI system',
  analyzed:       'You\'ve been shortlisted! An AI interview will be scheduled soon',
  pending_review: 'A recruiter is reviewing your profile',
  scheduled:      'Check your email and phone for interview details',
  in_call:        'Your AI interview is happening right now',
  completed:      'Interview done! The team will be in touch soon',
  rejected:       'Thank you for your time — we\'ll keep your profile for future opportunities',
  failed:         'There was a technical issue. Please contact support',
}

function getJourneyStep(status) {
  for (let i = 0; i < JOURNEY.length; i++) {
    if (JOURNEY[i].statuses.includes(status)) return i
  }
  return 0
}

function JourneyTimeline({ app }) {
  const currentStep = getJourneyStep(app.status)
  const isRejected  = ['rejected', 'failed'].includes(app.status)
  const isCompleted = app.status === 'completed'

  return (
    <div className="mt-4 relative pl-8">
      {/* Vertical connector */}
      <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-100" />

      <div className="space-y-3">
        {JOURNEY.map((node, i) => {
          const NodeIcon = node.icon
          const isPast    = i < currentStep
          const isCurrent = i === currentStep
          const isFuture  = i > currentStep

          // On rejection/failure, mark remaining nodes as skipped
          const isSkipped = isRejected && i > currentStep

          let dotClass = ''
          let lineClass = 'bg-slate-100'
          let textClass = 'text-ink-faint'

          if (isSkipped) {
            dotClass = 'bg-slate-100 border-2 border-slate-200'
          } else if (isPast || (isCompleted && i < JOURNEY.length)) {
            dotClass = 'bg-port-600 text-white'
            lineClass = 'bg-port-200'
            textClass = 'text-ink'
          } else if (isCurrent && !isRejected) {
            dotClass = 'bg-port-600 text-white ring-4 ring-port-100'
            textClass = 'text-ink font-semibold'
          } else {
            dotClass = 'bg-slate-100 border-2 border-slate-200 text-slate-400'
          }

          return (
            <div key={node.key} className="relative flex items-start gap-3 min-h-[2rem]">
              {/* Dot */}
              <div className={`absolute -left-[1.625rem] w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${dotClass}`}>
                {isPast || (isCompleted && i < JOURNEY.length - 1) ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <NodeIcon className="w-3 h-3" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-2">
                <div className={`text-sm font-medium ${textClass} flex items-center gap-2 flex-wrap`}>
                  {node.label}
                  {isCurrent && !isRejected && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-port-50 text-port-700 animate-pulse">
                      <Clock className="w-2.5 h-2.5" /> Now
                    </span>
                  )}
                  {node.key === 'scheduled' && app.status === 'scheduled' && app.scheduled_at && (
                    <span className="text-xs text-port-600 font-medium">{new Date(app.scheduled_at).toLocaleString('en-IN')}</span>
                  )}
                </div>
                {isCurrent && !isRejected && STATUS_DESC[app.status] && (
                  <p className="text-xs text-ink-faint mt-0.5 leading-relaxed">{STATUS_DESC[app.status]}</p>
                )}
                {isCurrent && isRejected && (
                  <p className="text-xs text-ink-faint mt-0.5">{STATUS_DESC[app.status]}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InterviewTipsCard() {
  return (
    <div className="mt-3 bg-port-50 rounded-xl p-4 border border-port-100 flex items-start gap-3">
      <Lightbulb className="w-4 h-4 text-port-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-port-800 mb-1">Interview Tips</p>
        <ul className="text-xs text-port-700 space-y-1">
          <li>• Find a quiet place with good phone signal</li>
          <li>• Keep your resume handy for reference</li>
          <li>• Alex is an AI — you can ask it to repeat a question or give you a moment</li>
          <li>• Speak clearly; the AI will confirm it heard you before moving on</li>
        </ul>
      </div>
    </div>
  )
}

export default function MyApplications() {
  const { user, ready } = useCandidateAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('applications')
  const [apps, setApps] = useState([])
  const [savedJobs, setSavedJobs] = useState([])
  const [allJobs, setAllJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (ready && !user) { navigate('/portal/login', { state: { from: '/portal/applications' } }); return }
    if (user) {
      Promise.all([
        portalMyApplications(),
        portalGetSavedJobs().catch(() => ({ saved_job_ids: [] })),
        portalGetJobs().catch(() => []),
      ]).then(([appsData, savedData, jobsData]) => {
        setApps(appsData)
        if (appsData.length > 0) setExpanded(appsData[0].id)
        const savedIds = new Set(savedData.saved_job_ids)
        setSavedJobs(jobsData.filter(j => savedIds.has(j.id)))
        setAllJobs(jobsData)
      }).finally(() => setLoading(false))
    }
  }, [user, ready])

  const handleUnsave = async (jobId) => {
    await portalUnsaveJob(jobId).catch(() => {})
    setSavedJobs(prev => prev.filter(j => j.id !== jobId))
  }

  const handleWithdraw = async (app) => {
    if (!confirm(`Withdraw your application for "${app.job_title}"? This cannot be undone.`)) return
    try {
      await portalWithdraw(app.id)
      setApps(prev => prev.filter(a => a.id !== app.id))
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not withdraw application')
    }
  }

  if (!ready) return null

  const statusIcon = (status) => {
    if (status === 'completed') return <CheckCircle className="w-4 h-4 text-green-600" />
    if (status === 'rejected')  return <XCircle className="w-4 h-4 text-red-500" />
    if (status === 'failed')    return <AlertCircle className="w-4 h-4 text-slate-400" />
    return <Clock className="w-4 h-4 text-port-500 animate-pulse" />
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">My Activity</h1>
          <p className="text-ink-soft text-sm mt-0.5">
            {loading ? '…' : `${apps.length} application${apps.length !== 1 ? 's' : ''} · ${savedJobs.length} saved`}
          </p>
        </div>
        <Link to="/portal"
          className="inline-flex items-center gap-2 text-sm font-semibold bg-port-600 text-white px-4 py-2 rounded-card hover:bg-port-700 transition-colors shadow-sm">
          <Briefcase className="w-4 h-4" />
          Browse Jobs
        </Link>
      </div>

      {/* Segmented control (J1) */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'applications', label: 'Applications', count: apps.length },
          { key: 'saved',        label: 'Saved',        count: savedJobs.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-pill font-bold ${
              tab === t.key ? 'bg-port-50 text-port-700' : 'text-ink-faint'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <Skeleton key={i} className="h-32 rounded-card" />)}
        </div>
      ) : tab === 'saved' ? (
        savedJobs.length === 0 ? (
          <div className="bg-white rounded-card shadow-card border border-slate-100">
            <EmptyState
              icon={Bookmark}
              title="No saved jobs"
              hint="Bookmark jobs from the job board to find them here"
              tone="port"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {savedJobs.map(job => (
              <div key={job.id} className="bg-white rounded-card shadow-card border border-slate-100 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link to={`/portal/jobs/${job.id}`}
                    className="text-sm font-bold text-ink hover:text-port-600 transition-colors">{job.title}</Link>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft mt-0.5">
                    {job.company && <span className="font-medium">{job.company}</span>}
                    {job.location && <span>{job.location}</span>}
                    {job.salary_min && <span className="text-green-600 font-medium">₹{job.salary_min}–{job.salary_max || '?'} LPA</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link to={`/portal/jobs/${job.id}`}
                    className="text-xs bg-port-600 text-white px-3 py-1.5 rounded-card font-semibold hover:bg-port-700 transition-colors">
                    Apply
                  </Link>
                  <button onClick={() => handleUnsave(job.id)}
                    className="p-1.5 text-port-600 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                    title="Remove from saved">
                    <Bookmark className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-card shadow-card border border-slate-100">
          <EmptyState
            icon={FileText}
            title="No applications yet"
            hint="Browse open positions and submit your first application"
            tone="port"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map(app => {
            const isExpanded = expanded === app.id
            const canWithdraw = ['pending', 'analyzed', 'pending_review'].includes(app.status)

            return (
              <div key={app.id} className="bg-white rounded-card shadow-card border border-slate-100 overflow-hidden">
                {/* Card header */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : app.id)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {statusIcon(app.status)}
                      <div>
                        <h3 className="font-bold text-ink leading-tight">{app.job_title}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft mt-0.5">
                          {app.company && <span className="font-medium text-ink-soft">{app.company}</span>}
                          {app.location && <span>{app.location}</span>}
                          <span>Applied {new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {app.match_score != null && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${app.match_score >= 70 ? 'bg-green-500' : app.match_score >= 45 ? 'bg-amber-400' : 'bg-red-400'}`}
                              style={{ width: `${app.match_score}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${app.match_score >= 70 ? 'text-green-600' : app.match_score >= 45 ? 'text-amber-600' : 'text-red-500'}`}>
                            {app.match_score}%
                          </span>
                        </div>
                      )}
                      <span className={`text-[10px] font-medium ${isExpanded ? 'text-port-600' : 'text-ink-faint'}`}>
                        {isExpanded ? '▲ collapse' : '▼ details'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expandable journey */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-50">
                    <JourneyTimeline app={app} />

                    {app.status === 'scheduled' && <InterviewTipsCard />}

                    {canWithdraw && (
                      <div className="mt-4 flex justify-end">
                        <button onClick={() => handleWithdraw(app)}
                          className="text-xs text-ink-faint hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-red-200">
                          Withdraw application
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
