import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCandidate, getCandidateReport, initiateCall,
  submitDecision, retriggerPipeline, downloadReportPDF, getCallRecordingUrl,
} from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import {
  Phone, RotateCcw, FileDown, Check, AlertTriangle,
  Copy, ChevronLeft, Loader2, CheckCircle2,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'

const PIPELINE_STEPS = ['Parsing', 'Profile', 'Scoring', 'Questions', 'Ready']

function getActiveStep(c) {
  if (!c) return 0
  if (c.questions_json?.length > 0) return 4
  if (c.match_score != null) return 3
  if (c.profile_json) return 2
  return 0
}

function PipelineStepper({ candidate }) {
  const step = getActiveStep(candidate)
  const done = step === 4
  const failed = ['rejected', 'failed'].includes(candidate?.status)
  return (
    <div className={`rounded-card p-5 border ${done ? 'bg-green-50 border-green-200' : failed ? 'bg-red-50 border-red-200' : 'bg-brand-50 border-brand-200'}`}>
      <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-3">
        {failed ? 'Pipeline stopped' : done ? 'Pipeline complete' : 'Processing…'}
      </p>
      {!failed && (
        <div className="flex items-center">
          {PIPELINE_STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending'
            return (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center min-w-0 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    state === 'done'   ? 'bg-green-500 text-white' :
                    state === 'active' ? 'bg-brand-600 text-white ring-4 ring-brand-100' :
                                        'bg-slate-200 text-slate-400'
                  }`}>
                    {state === 'done' ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className="text-xs text-ink-faint mt-1 text-center hidden sm:block whitespace-nowrap">{label}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 transition-all ${i < step ? 'bg-green-400' : 'bg-slate-200'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScoreBar3({ label, score, accent = 'brand' }) {
  const pct = score ?? 0
  const colorBar = accent === 'brand' ? 'bg-brand-500' : 'bg-port-500'
  const colorText = pct >= 70 ? 'text-green-600' : pct >= 45 ? 'text-amber-500' : 'text-red-500'
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-ink-soft">{label}</span>
        <span className={`text-xs font-bold ${colorText}`}>{pct}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorBar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const TABS = ['Profile', 'Questions', 'Transcript', 'Report']

const REC_COLOR = {
  HIRE:      { pill: 'bg-green-100 text-green-700 border-green-200', btn: 'bg-green-500 text-white border-green-500' },
  SHORTLIST: { pill: 'bg-blue-100 text-blue-700 border-blue-200',   btn: 'bg-blue-500 text-white border-blue-500' },
  HOLD:      { pill: 'bg-amber-100 text-amber-700 border-amber-200', btn: 'bg-amber-500 text-white border-amber-500' },
  REJECT:    { pill: 'bg-red-100 text-red-600 border-red-200',      btn: 'bg-red-500 text-white border-red-500' },
}

export default function CandidateDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [candidate, setCandidate] = useState(null)
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionSent, setDecisionSent] = useState(null)
  const [retriggering, setRetriggering] = useState(false)
  const [downloadingPDF, setDownloadingPDF] = useState(false)
  const [activeTab, setActiveTab] = useState('Profile')

  // Pipeline polling for in-progress candidates
  useEffect(() => {
    if (!candidate) return
    const isPipeline = ['pending', 'analyzed'].includes(candidate.status) && !candidate.questions_json?.length
    if (!isPipeline) return
    const id2 = setInterval(async () => {
      try {
        const fresh = await getCandidate(id)
        setCandidate(fresh)
        if (fresh.questions_json?.length > 0 || ['rejected', 'failed'].includes(fresh.status)) {
          clearInterval(id2)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(id2)
  }, [candidate?.status, id])

  useEffect(() => {
    getCandidate(id).then(setCandidate)
    setLoadingReport(true)
    getCandidateReport(id)
      .then(r => { setReport(r); if (r.hr_notes) setDecisionNotes(r.hr_notes) })
      .catch(() => {})
      .finally(() => setLoadingReport(false))
  }, [id])

  const handleDecision = async (decision) => {
    if (!confirm(`Send "${decision}" decision to ${candidate.name}? This will email them immediately.`)) return
    setDecisionLoading(true)
    try {
      await submitDecision(id, decision, decisionNotes)
      setDecisionSent(decision)
      toast(`Decision "${decision}" sent to ${candidate.name}`)
      const [freshC, freshR] = await Promise.all([
        getCandidate(id),
        getCandidateReport(id).catch(() => report),
      ])
      setCandidate(freshC)
      setReport(freshR)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit decision')
      toast('Failed to submit decision', 'error')
    } finally { setDecisionLoading(false) }
  }

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true)
    try {
      await downloadReportPDF(id, candidate.name)
      toast('PDF downloaded')
    } catch {
      toast('PDF download failed — report may not be ready yet', 'error')
    } finally { setDownloadingPDF(false) }
  }

  const handleRetrigger = async () => {
    if (!confirm('Re-run the AI pipeline for this candidate?')) return
    setRetriggering(true)
    try {
      await retriggerPipeline(id)
      const fresh = await getCandidate(id)
      setCandidate(fresh)
      toast('Pipeline re-triggered')
    } catch (err) {
      toast(err.response?.data?.detail || 'Re-trigger failed', 'error')
    } finally { setRetriggering(false) }
  }

  const handleCall = async () => {
    if (!confirm(`Manually trigger call to ${candidate.name}?`)) return
    setCalling(true)
    try {
      await initiateCall(id)
      toast('Call initiated — check the schedule page for status')
    } catch (err) {
      toast(err.response?.data?.detail || 'Call failed', 'error')
    } finally { setCalling(false) }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'))
  }

  if (!candidate) return (
    <div className="p-8 flex items-center gap-3 text-ink-faint">
      <Loader2 className="w-5 h-5 animate-spin" />
      Loading candidate…
    </div>
  )

  const profile = candidate.profile_json || {}
  const canCall = ['analyzed', 'pending_review', 'scheduled'].includes(candidate.status) && candidate.consent_given
  const isPipeline = ['pending', 'analyzed'].includes(candidate.status) && !candidate.questions_json?.length

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Breadcrumb */}
      <Link to="/candidates" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-600 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Candidates
      </Link>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-card">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Header band */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="font-display text-xl font-bold text-brand-600">{candidate.name?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-2xl font-bold text-ink">{candidate.name}</h1>
                <StatusBadge status={candidate.status} />
              </div>
              {candidate.job_title && (
                <p className="text-sm text-ink-soft mt-0.5">{candidate.job_title}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-2">
                {candidate.email && (
                  <button onClick={() => copyToClipboard(candidate.email)}
                    className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-600 transition-colors group">
                    {candidate.email}
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                {candidate.phone && (
                  <button onClick={() => copyToClipboard(candidate.phone)}
                    className="flex items-center gap-1.5 text-sm text-ink-soft hover:text-brand-600 transition-colors group">
                    {candidate.phone}
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {canCall && (
              <button onClick={handleCall} disabled={calling}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-brand-600 text-white px-3 py-2 rounded-card hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {calling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                {calling ? 'Calling…' : 'Trigger Call'}
              </button>
            )}
            {['failed', 'pending'].includes(candidate.status) && (
              <button onClick={handleRetrigger} disabled={retriggering}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-amber-500 text-white px-3 py-2 rounded-card hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {retriggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {retriggering ? 'Re-running…' : 'Re-run Pipeline'}
              </button>
            )}
            {report && (
              <button onClick={handleDownloadPDF} disabled={downloadingPDF}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border border-slate-200 text-ink px-3 py-2 rounded-card hover:bg-slate-50 disabled:opacity-50 transition-colors">
                {downloadingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                {downloadingPDF ? 'Generating…' : 'Download PDF'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content: two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: score panel */}
        <div className="space-y-4">
          {isPipeline ? (
            <PipelineStepper candidate={candidate} />
          ) : candidate.match_score != null ? (
            <div className="bg-white rounded-card shadow-card border border-slate-100 p-5">
              <h2 className="font-semibold text-ink mb-3">Score Breakdown</h2>
              {report ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart outerRadius="70%" data={[
                      { d: 'Skills',        s: report.skills_score        || 0 },
                      { d: 'Experience',    s: report.experience_score    || 0 },
                      { d: 'Communication', s: report.communication_score || 0 },
                      { d: 'Culture Fit',   s: report.culture_fit_score   || 0 },
                      { d: 'Confidence',    s: report.confidence_score    || 0 },
                      { d: 'Overall',       s: report.overall_score       || 0 },
                    ]}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="d" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                      <Radar dataKey="s" fill="#4F46E5" fillOpacity={0.2} stroke="#4F46E5" strokeWidth={2}
                        dot={{ r: 3, fill: '#4F46E5' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
                    {[['Skills', report.skills_score], ['Experience', report.experience_score],
                      ['Communication', report.communication_score], ['Culture Fit', report.culture_fit_score],
                      ['Confidence', report.confidence_score], ['Overall', report.overall_score],
                    ].map(([label, score]) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-ink-faint">{label}</span>
                        <span className={`font-bold ${(score||0) >= 70 ? 'text-green-600' : (score||0) >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                          {score ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className={`font-display text-5xl font-bold ${candidate.match_score >= 70 ? 'text-green-600' : candidate.match_score >= 45 ? 'text-amber-500' : 'text-red-500'}`}>
                    {candidate.match_score}
                  </div>
                  <div className="text-xs text-ink-faint mt-1">Combined Score</div>
                </div>
              )}
              <div className="mt-4 space-y-2.5">
                <ScoreBar3 label={`Semantic (${Math.round(candidate.vector_score || 0)})`} score={Math.round(candidate.vector_score || 0)} />
                <ScoreBar3 label={`LLM (${Math.round(candidate.llm_score || 0)})`} score={Math.round(candidate.llm_score || 0)} />
                <ScoreBar3 label={`Combined (${candidate.match_score})`} score={candidate.match_score} />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-card shadow-card border border-slate-100 p-5">
              <p className="text-sm text-ink-faint">Scoring in progress…</p>
            </div>
          )}

          {/* Quick meta */}
          <div className="bg-white rounded-card shadow-card border border-slate-100 p-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-faint">Consent</span>
              <span className={candidate.consent_given ? 'text-green-600 font-medium' : 'text-red-500'}>
                {candidate.consent_given ? 'Given' : 'Not given'}
              </span>
            </div>
            {candidate.source && (
              <div className="flex justify-between">
                <span className="text-ink-faint">Source</span>
                <span className="text-ink capitalize">{candidate.source}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink-faint">Applied</span>
              <span className="text-ink">{new Date(candidate.created_at).toLocaleDateString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 bg-white rounded-card shadow-card border border-slate-100 p-1">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-soft hover:text-ink hover:bg-slate-50'
                }`}>
                {tab}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {activeTab === 'Profile' && (
            <div className="bg-white rounded-card shadow-card border border-slate-100 p-6 space-y-5">
              {profile.skills?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((s, i) => (
                      <span key={i} className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-1 rounded-pill font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {profile.total_years_experience != null && (
                  <div>
                    <p className="text-xs text-ink-faint mb-0.5">Experience</p>
                    <p className="font-medium text-ink">{profile.total_years_experience} years</p>
                  </div>
                )}
                {profile.current_role && (
                  <div>
                    <p className="text-xs text-ink-faint mb-0.5">Current Role</p>
                    <p className="font-medium text-ink">{profile.current_role}</p>
                  </div>
                )}
                {profile.current_company && (
                  <div>
                    <p className="text-xs text-ink-faint mb-0.5">Current Company</p>
                    <p className="font-medium text-ink">{profile.current_company}</p>
                  </div>
                )}
                {profile.location && (
                  <div>
                    <p className="text-xs text-ink-faint mb-0.5">Location</p>
                    <p className="font-medium text-ink">{profile.location}</p>
                  </div>
                )}
              </div>
              {profile.education?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Education</p>
                  <div className="space-y-1">
                    {profile.education.map((e, i) => (
                      <p key={i} className="text-sm text-ink">{typeof e === 'string' ? e : `${e.degree || ''} ${e.institution ? `· ${e.institution}` : ''}`}</p>
                    ))}
                  </div>
                </div>
              )}
              {!profile.skills?.length && !profile.total_years_experience && (
                <p className="text-sm text-ink-faint">Profile extraction in progress…</p>
              )}
            </div>
          )}

          {/* Questions tab */}
          {activeTab === 'Questions' && (
            <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
              {candidate.questions_json?.length > 0 ? (
                <div className="space-y-3">
                  {candidate.questions_json.map((q, i) => (
                    <div key={i} className="flex gap-3 p-3.5 bg-slate-50 rounded-xl">
                      <span className="w-6 h-6 bg-brand-100 text-brand-700 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm text-ink">{q.question}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-ink-faint capitalize">{q.type?.replace('_', ' ')}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                            q.difficulty === 'hard' ? 'bg-red-50 text-red-600' :
                            q.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' :
                            'bg-green-50 text-green-600'
                          }`}>
                            {q.difficulty}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-faint py-4">Questions will appear once the pipeline completes.</p>
              )}
            </div>
          )}

          {/* Transcript tab */}
          {activeTab === 'Transcript' && (
            <div className="bg-white rounded-card shadow-card border border-slate-100">
              {report?.call_id && (
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                  <audio controls src={getCallRecordingUrl(report.call_id)} className="w-full h-8" preload="none" />
                </div>
              )}
              <div className="p-5 space-y-3 max-h-[500px] overflow-y-auto">
                {report?.transcript?.length > 0 ? report.transcript.map((t, i) => (
                  <div key={i} className={`flex gap-2 ${t.role === 'ai' ? '' : 'flex-row-reverse'}`}>
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 bg-slate-200 text-slate-600">
                      {t.role === 'ai' ? 'A' : 'C'}
                    </div>
                    <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      t.role === 'ai' ? 'bg-slate-100 text-ink rounded-tl-sm' : 'bg-brand-50 text-ink rounded-tr-sm'
                    }`}>
                      <span className="text-[10px] font-semibold text-ink-faint block mb-0.5">
                        {t.role === 'ai' ? 'Alex (AI)' : 'Candidate'}
                        {t.timestamp && <span className="ml-2 font-normal">{t.timestamp}</span>}
                      </span>
                      {t.text}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-ink-faint py-4">Transcript will be available after the interview call.</p>
                )}
              </div>
            </div>
          )}

          {/* Report tab */}
          {activeTab === 'Report' && (
            <div className="space-y-4">
              {loadingReport ? (
                <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
                  <div className="flex items-center gap-2 text-ink-faint">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading report…
                  </div>
                </div>
              ) : report ? (
                <>
                  {/* Recommendation */}
                  <div className={`rounded-card p-5 border ${REC_COLOR[report.ai_recommendation]?.pill || 'bg-slate-50 border-slate-200 text-ink'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-60">AI Recommendation</p>
                        <p className="font-display text-2xl font-bold mt-0.5">{report.ai_recommendation || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs opacity-60">Call Score</p>
                        <p className="font-display text-3xl font-bold">{report.overall_score ?? '—'}</p>
                      </div>
                    </div>
                    {report.ai_reasoning && (
                      <p className="mt-3 text-sm opacity-80 leading-relaxed">{report.ai_reasoning}</p>
                    )}
                  </div>

                  {/* Strengths & red flags */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {report.strengths?.length > 0 && (
                      <div className="bg-green-50 rounded-card p-4 border border-green-100">
                        <h3 className="font-semibold text-green-800 mb-2 text-sm">Strengths</h3>
                        <ul className="space-y-1.5">
                          {report.strengths.map((s, i) => (
                            <li key={i} className="text-sm text-green-700 flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.red_flags?.length > 0 && (
                      <div className="bg-red-50 rounded-card p-4 border border-red-100">
                        <h3 className="font-semibold text-red-800 mb-2 text-sm">Red Flags</h3>
                        <ul className="space-y-1.5">
                          {report.red_flags.map((f, i) => (
                            <li key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* HR Decision */}
                  <div className="bg-white rounded-card shadow-card border border-slate-100 p-5">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div>
                        <h2 className="font-semibold text-ink">HR Decision</h2>
                        <p className="text-xs text-ink-faint mt-0.5">Sends notification email immediately</p>
                      </div>
                      {(report.hr_override || decisionSent) && (
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-pill border ${REC_COLOR[report.hr_override || decisionSent]?.pill || ''}`}>
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />
                          Sent: {report.hr_override || decisionSent}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                      {[
                        { d: 'HIRE',      label: 'Hire' },
                        { d: 'SHORTLIST', label: 'Shortlist' },
                        { d: 'HOLD',      label: 'Hold' },
                        { d: 'REJECT',    label: 'Reject' },
                      ].map(({ d, label }) => {
                        const isCurrent = (report.hr_override || decisionSent) === d
                        return (
                          <button key={d} onClick={() => handleDecision(d)} disabled={decisionLoading}
                            className={`py-2.5 rounded-card border-2 text-sm font-semibold transition-all disabled:opacity-50 ${
                              isCurrent ? REC_COLOR[d].btn : `${REC_COLOR[d].pill} hover:opacity-80`
                            }`}>
                            {decisionLoading && isCurrent ? '…' : label}
                          </button>
                        )
                      })}
                    </div>
                    <textarea value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)}
                      placeholder="Optional HR notes (not sent to candidate)…"
                      rows={2}
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                    />
                  </div>

                  {/* Next round questions */}
                  {report.next_round_questions?.length > 0 && (
                    <div className="bg-white rounded-card shadow-card border border-slate-100 p-5">
                      <h2 className="font-semibold text-ink mb-3">Suggested Next-Round Questions</h2>
                      <ul className="space-y-2">
                        {report.next_round_questions.map((q, i) => (
                          <li key={i} className="text-sm text-ink flex items-start gap-2">
                            <span className="text-brand-400 font-bold flex-shrink-0">{i + 1}.</span>{q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
                  <p className="text-sm text-ink-faint">
                    {candidate.status === 'completed' ? 'Report not available yet.' : 'Report will be available after the interview call.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
