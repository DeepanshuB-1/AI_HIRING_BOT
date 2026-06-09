import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCandidate, getCandidateReport, initiateCall, submitDecision } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ScoreBar from '../components/ScoreBar'

const REC_COLOR = {
  HIRE:      'bg-green-100 text-green-700 border-green-200',
  SHORTLIST: 'bg-blue-100 text-blue-700 border-blue-200',
  HOLD:      'bg-yellow-100 text-yellow-700 border-yellow-200',
  REJECT:    'bg-red-100 text-red-600 border-red-200',
}

export default function CandidateDetail() {
  const { id } = useParams()
  const [candidate, setCandidate] = useState(null)
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [decisionSent, setDecisionSent] = useState(null) // the decision that was sent

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
      // refresh candidate + report to reflect updated status / hr_override
      const [freshCandidate, freshReport] = await Promise.all([
        getCandidate(id),
        getCandidateReport(id).catch(() => report),
      ])
      setCandidate(freshCandidate)
      setReport(freshReport)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit decision')
    } finally {
      setDecisionLoading(false)
    }
  }

  const handleCall = async () => {
    if (!confirm(`Manually trigger call to ${candidate.name}?`)) return
    setCalling(true)
    try {
      await initiateCall(id)
      alert('Call initiated! Check the schedule page for status.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Call failed')
    } finally { setCalling(false) }
  }

  if (!candidate) return <div className="p-8 text-gray-400">Loading...</div>

  const profile = candidate.profile_json || {}
  const canCall = ['analyzed', 'pending_review', 'scheduled'].includes(candidate.status) && candidate.consent_given

  return (
    <div className="p-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link to="/candidates" className="hover:text-indigo-600">Candidates</Link>
        <span>›</span>
        <span className="text-gray-700 font-medium">{candidate.name}</span>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

      {/* Top section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidate info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{candidate.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{candidate.email}</p>
              <p className="text-sm text-gray-500">{candidate.phone}</p>
            </div>
            <StatusBadge status={candidate.status} />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Consent</span>
              <span className={candidate.consent_given ? 'text-green-600 font-medium' : 'text-red-500'}>
                {candidate.consent_given ? '✓ Given' : '✗ Not given'}
              </span>
            </div>
            {candidate.source && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Source</span>
                <span className="text-gray-700 capitalize">{candidate.source}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Applied</span>
              <span className="text-gray-700">{new Date(candidate.created_at).toLocaleDateString('en-IN')}</span>
            </div>
          </div>

          {canCall && (
            <button onClick={handleCall} disabled={calling}
              className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {calling ? 'Calling...' : candidate.status === 'scheduled' ? '📞 Call Now (Missed Slot)' : '📞 Trigger Call Now'}
            </button>
          )}
          {['analyzed', 'pending_review'].includes(candidate.status) && !candidate.consent_given && (
            <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
              Waiting for candidate consent to schedule call
            </p>
          )}
        </div>

        {/* Scores */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Match Scores</h2>
          {candidate.match_score != null ? (
            <div className="space-y-4">
              <div className="text-center py-3">
                <div className={`text-5xl font-bold ${candidate.match_score >= 70 ? 'text-green-600' : candidate.match_score >= 45 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {candidate.match_score}
                </div>
                <div className="text-sm text-gray-400 mt-1">Overall Score</div>
              </div>
              <ScoreBar label="Vector Similarity (40%)" score={Math.round(candidate.vector_score || 0)} />
              <ScoreBar label="LLM Assessment (60%)" score={Math.round(candidate.llm_score || 0)} />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Scoring in progress...</p>
          )}
        </div>

        {/* Profile skills */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Extracted Profile</h2>
          {profile.skills?.length ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.slice(0, 15).map((s, i) => (
                    <span key={i} className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
              {profile.total_years_experience != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Experience</span>
                  <span className="font-medium">{profile.total_years_experience} years</span>
                </div>
              )}
              {profile.education?.[0] && (
                <div className="text-sm">
                  <span className="text-gray-500">Education: </span>
                  <span>{profile.education[0].degree || profile.education[0]}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Profile extraction in progress...</p>
          )}
        </div>
      </div>

      {/* Questions */}
      {candidate.questions_json?.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Generated Interview Questions ({candidate.questions_json.length})</h2>
          <div className="space-y-3">
            {candidate.questions_json.map((q, i) => (
              <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-100 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{q.question}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400 capitalize">{q.type?.replace('_', ' ')}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${q.difficulty === 'hard' ? 'bg-red-100 text-red-600' : q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-600'}`}>
                      {q.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {loadingReport ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <p className="text-gray-400 text-sm">Loading report...</p>
        </div>
      ) : report ? (
        <div className="space-y-4">
          {/* Recommendation banner */}
          <div className={`rounded-xl p-5 border ${REC_COLOR[report.ai_recommendation] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">AI Recommendation</div>
                <div className="text-2xl font-bold mt-0.5">{report.ai_recommendation}</div>
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70">Call Score</div>
                <div className="text-3xl font-bold">{report.overall_score}</div>
              </div>
            </div>
            {report.ai_reasoning && (
              <p className="mt-3 text-sm opacity-80">{report.ai_reasoning}</p>
            )}
          </div>

          {/* HR Decision Panel */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-800">HR Decision</h2>
                <p className="text-xs text-gray-400 mt-0.5">Select a decision to notify the candidate by email immediately</p>
              </div>
              {(report.hr_override || decisionSent) && (
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  (report.hr_override || decisionSent) === 'HIRE' ? 'bg-green-100 text-green-700' :
                  (report.hr_override || decisionSent) === 'SHORTLIST' ? 'bg-blue-100 text-blue-700' :
                  (report.hr_override || decisionSent) === 'HOLD' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-600'
                }`}>
                  ✓ Decision sent: {report.hr_override || decisionSent}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { d: 'HIRE',      label: '✓ Hire',       cls: 'border-green-300 text-green-700 hover:bg-green-50',  active: 'bg-green-500 text-white border-green-500' },
                { d: 'SHORTLIST', label: '→ Shortlist',  cls: 'border-blue-300 text-blue-700 hover:bg-blue-50',    active: 'bg-blue-500 text-white border-blue-500'  },
                { d: 'HOLD',      label: '⏸ Hold',       cls: 'border-yellow-300 text-yellow-700 hover:bg-yellow-50', active: 'bg-yellow-500 text-white border-yellow-500' },
                { d: 'REJECT',    label: '✕ Reject',     cls: 'border-red-300 text-red-600 hover:bg-red-50',       active: 'bg-red-500 text-white border-red-500'    },
              ].map(({ d, label, cls, active }) => {
                const isCurrent = (report.hr_override || decisionSent) === d
                return (
                  <button
                    key={d}
                    onClick={() => handleDecision(d)}
                    disabled={decisionLoading}
                    className={`py-2.5 px-4 rounded-lg border-2 text-sm font-semibold transition-all disabled:opacity-50 ${isCurrent ? active : cls}`}
                  >
                    {decisionLoading && isCurrent ? 'Sending...' : label}
                  </button>
                )
              })}
            </div>

            <textarea
              value={decisionNotes}
              onChange={e => setDecisionNotes(e.target.value)}
              placeholder="Optional HR notes (saved to report, not sent to candidate)..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score breakdown */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h2 className="font-semibold text-gray-800">Score Breakdown</h2>
              <ScoreBar label="Skills" score={report.skills_score} />
              <ScoreBar label="Experience" score={report.experience_score} />
              <ScoreBar label="Communication" score={report.communication_score} />
              <ScoreBar label="Culture Fit" score={report.culture_fit_score} />
              <ScoreBar label="Confidence" score={report.confidence_score} />
            </div>

            {/* Strengths & red flags */}
            <div className="space-y-4">
              {report.strengths?.length > 0 && (
                <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                  <h3 className="font-semibold text-green-800 mb-3">Strengths</h3>
                  <ul className="space-y-1">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                        <span className="mt-0.5">✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.red_flags?.length > 0 && (
                <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                  <h3 className="font-semibold text-red-800 mb-3">Red Flags</h3>
                  <ul className="space-y-1">
                    {report.red_flags.map((f, i) => (
                      <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                        <span className="mt-0.5">⚠</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Transcript */}
          {report.transcript?.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-4">Call Transcript</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {report.transcript.map((t, i) => (
                  <div key={i} className={`flex gap-3 ${t.role === 'ai' ? '' : 'flex-row-reverse'}`}>
                    <div className={`text-xs px-3 py-2 rounded-xl max-w-[80%] ${
                      t.role === 'ai'
                        ? 'bg-indigo-50 text-indigo-900'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <span className="text-xs font-semibold opacity-60 block mb-0.5">
                        {t.role === 'ai' ? 'Alex (AI)' : 'Candidate'}
                      </span>
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next round questions */}
          {report.next_round_questions?.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-4">Suggested Next-Round Questions</h2>
              <ul className="space-y-2">
                {report.next_round_questions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">{i + 1}.</span>{q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        candidate.status === 'completed' && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">Report not available yet.</p>
          </div>
        )
      )}
    </div>
  )
}
