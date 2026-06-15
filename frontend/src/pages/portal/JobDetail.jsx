import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { portalGetJob, portalApply, portalJobMatch, portalSimilarJobs, portalRecordView } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'
import {
  MapPin, Briefcase, Clock, Star, Upload, CheckCircle2,
  ChevronLeft, Share2, FileText, Phone, UserCheck, ThumbsUp, TrendingUp,
} from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

const TYPE_LABELS = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship',
}

function CompanyAvatar({ name, size = 'md' }) {
  const initials = (name || 'Co').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['bg-port-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-brand-500']
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length]
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} ${color} rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// Split JD text into rough sections based on common headings
function parseSections(text) {
  if (!text) return [{ heading: null, body: text || '' }]
  const HEADINGS = /^(about|responsibilities|requirements|qualifications|skills|what you.ll do|what we.re looking for|nice to have|benefits|perks)/i
  const lines = text.split('\n')
  const sections = []
  let cur = { heading: null, lines: [] }
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && HEADINGS.test(trimmed)) {
      if (cur.lines.length > 0 || cur.heading) sections.push(cur)
      cur = { heading: trimmed, lines: [] }
    } else {
      cur.lines.push(line)
    }
  }
  if (cur.lines.length > 0 || cur.heading) sections.push(cur)
  return sections.map(s => ({ heading: s.heading, body: s.lines.join('\n').trim() }))
}

const HOW_IT_WORKS = [
  { Icon: Upload,      label: 'Upload resume',      desc: 'Takes less than 2 minutes' },
  { Icon: Star,        label: 'AI screening',        desc: 'We review your profile instantly' },
  { Icon: Phone,       label: 'Phone interview',     desc: 'A short call with our AI, Alex' },
  { Icon: ThumbsUp,    label: 'HR decision',         desc: 'You hear back either way' },
]

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useCandidateAuth()
  const toast = useToast()

  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState(user?.phone || '')
  const [fileName, setFileName] = useState('')
  const [matchData, setMatchData] = useState(null)
  const [similarJobs, setSimilarJobs] = useState([])
  const fileRef = useRef()

  useEffect(() => {
    portalGetJob(id)
      .then(j => { setJob(j); return j })
      .catch(() => navigate('/portal'))
      .finally(() => setLoading(false))
    portalSimilarJobs(id).then(setSimilarJobs).catch(() => {})
  }, [id])

  useEffect(() => {
    if (user?.phone) setPhone(user.phone)
    if (user && id) {
      portalJobMatch(id).then(setMatchData).catch(() => {})
      portalRecordView(id).catch(() => {})
    }
  }, [user, id])

  const handleApply = async (e) => {
    e.preventDefault()
    if (!user) { navigate('/portal/login', { state: { from: `/portal/jobs/${id}` } }); return }
    const file = fileRef.current?.files[0]
    if (!file) { setError('Please select your resume file'); return }
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'docx', 'txt'].includes(ext)) { setError('Resume must be PDF, DOCX, or TXT'); return }
    if (file.size > 10 * 1024 * 1024) { setError('File too large (max 10 MB)'); return }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) { setError('Please enter a valid phone number'); return }
    setApplying(true); setError('')
    try {
      const fd = new FormData()
      fd.append('resume', file)
      fd.append('phone', phone.trim())
      await portalApply(id, fd)
      setApplied(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit application')
    } finally { setApplying(false) }
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast('Link copied to clipboard'))
      .catch(() => toast('Could not copy link', 'error'))
  }

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-1/3 bg-slate-100 rounded-lg" />
      <div className="h-48 bg-slate-100 rounded-card" />
    </div>
  )
  if (!job) return null

  const sections = parseSections(job.jd_text)

  return (
    <div className="space-y-6">
      <Link to="/portal"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-port-600 transition-colors">
        <ChevronLeft className="w-4 h-4" />
        All positions
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: job details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Header card */}
          <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
            <div className="flex items-start gap-4 mb-4">
              <CompanyAvatar name={job.company} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h1 className="font-display text-2xl font-bold text-ink leading-tight">{job.title}</h1>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft mt-1.5">
                      {job.company && <span className="font-semibold text-ink">{job.company}</span>}
                      {job.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>}
                      {job.min_experience > 0 && <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{job.min_experience}+ yrs</span>}
                      {job.employment_type && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{TYPE_LABELS[job.employment_type] || job.employment_type}</span>}
                      {job.salary_min && <span className="flex items-center gap-1 text-green-600 font-medium"><Star className="w-3.5 h-3.5" />₹{job.salary_min}–{job.salary_max || '?'} LPA</span>}
                    </div>
                  </div>
                  <button onClick={handleShare}
                    className="inline-flex items-center gap-1.5 text-xs text-ink-soft border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-port-300 hover:text-port-600 transition-colors flex-shrink-0">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                </div>
              </div>
            </div>

            {/* Structured JD */}
            <div className="border-t border-slate-100 pt-4 space-y-5">
              {sections.map((section, i) => (
                <div key={i}>
                  {section.heading && (
                    <h3 className="text-xs font-bold text-ink-faint uppercase tracking-widest mb-2">
                      {section.heading}
                    </h3>
                  )}
                  {section.body && (
                    <div className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                      {section.body}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Required skills chips */}
            {job.required_skills?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-ink-faint uppercase tracking-widest mb-2">Required Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.required_skills.map(s => (
                    <span key={s} className="text-xs bg-slate-50 border border-slate-200 text-ink-soft px-3 py-1 rounded-pill font-medium">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* How hiring works */}
          <div className="bg-white rounded-card shadow-card border border-slate-100 p-6">
            <h2 className="font-display text-lg font-bold text-ink mb-4">How hiring works here</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {HOW_IT_WORKS.map(({ Icon, label, desc }, i) => (
                <div key={i} className="text-center">
                  <div className="w-10 h-10 bg-port-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-5 h-5 text-port-600" />
                  </div>
                  <p className="text-xs font-semibold text-ink">{label}</p>
                  <p className="text-xs text-ink-faint mt-0.5 leading-relaxed">{desc}</p>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="hidden sm:block absolute" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: sticky apply card */}
        <div className="lg:sticky lg:top-20 space-y-4">
          {/* Match Score ring (J2) */}
          {matchData && (
            matchData.applied && matchData.match_score != null ? (
              <div className="bg-white rounded-card shadow-card border border-slate-100 p-4 flex items-center gap-4">
                <MatchRing score={matchData.match_score} />
                <div>
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Your Match</p>
                  <p className="text-lg font-display font-bold text-ink">{matchData.match_score}%</p>
                  <p className="text-xs text-ink-faint capitalize">{matchData.status?.replace('_', ' ')}</p>
                </div>
              </div>
            ) : !matchData.applied ? (
              <div className="bg-port-50 border border-port-100 rounded-card p-3 text-xs text-port-700 leading-relaxed">
                Apply once and we'll show your match score for every job.
              </div>
            ) : null
          )}
          <div className="bg-white rounded-card shadow-pop border border-slate-100 p-5">
            {applied ? (
              <div className="text-center py-5">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="font-display font-bold text-ink text-lg mb-1">Application Submitted!</h3>
                <p className="text-sm text-ink-soft mb-5 leading-relaxed">We'll review your application and reach out via SMS and email.</p>
                <Link to="/portal/applications"
                  className="block w-full text-center bg-port-600 text-white py-2.5 rounded-card text-sm font-semibold hover:bg-port-700 transition-colors">
                  View My Applications
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="font-display font-bold text-ink text-lg">Apply Now</h3>
                  <p className="text-xs text-ink-faint mt-0.5">Takes less than 2 minutes</p>
                  {job.salary_min && (
                    <p className="text-sm font-semibold text-green-600 mt-1.5">₹{job.salary_min}–{job.salary_max || '?'} LPA</p>
                  )}
                  {job.employment_type && (
                    <p className="text-xs text-ink-faint mt-0.5">{TYPE_LABELS[job.employment_type]} · {job.min_experience > 0 ? `${job.min_experience}+ yrs` : 'Any experience'}</p>
                  )}
                </div>

                {!user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
                    <Link to="/portal/login" state={{ from: `/portal/jobs/${id}` }} className="font-semibold underline">Sign in</Link> or{' '}
                    <Link to="/portal/register" className="font-semibold underline">register</Link> to apply
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleApply} className="space-y-3">
                  {user && (
                    <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-port-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-port-700">{user.name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">{user.name}</p>
                        <p className="text-xs text-ink-faint">{user.email}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft mb-1 uppercase tracking-wide">Phone *</label>
                    <input required value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft mb-1 uppercase tracking-wide">Resume (PDF/DOCX) *</label>
                    <label className={`flex items-center gap-2.5 w-full border-2 border-dashed rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${fileName ? 'border-port-300 bg-port-50' : 'border-slate-200 hover:border-port-300 hover:bg-slate-50'}`}>
                      <FileText className={`w-4 h-4 flex-shrink-0 ${fileName ? 'text-port-500' : 'text-ink-faint'}`} />
                      <span className={`text-sm truncate ${fileName ? 'text-port-700 font-medium' : 'text-ink-faint'}`}>
                        {fileName || 'Click to upload'}
                      </span>
                      <input ref={fileRef} type="file" required accept=".pdf,.docx,.txt" className="hidden"
                        onChange={e => setFileName(e.target.files[0]?.name || '')} />
                    </label>
                  </div>
                  <button type="submit" disabled={applying || !user}
                    className="w-full bg-port-600 text-white py-2.5 rounded-card text-sm font-bold hover:bg-port-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {applying ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
                    ) : user ? (
                      <><UserCheck className="w-4 h-4" />Submit Application</>
                    ) : 'Sign in to Apply'}
                  </button>
                </form>
                <p className="text-xs text-ink-faint text-center mt-3 leading-relaxed">
                  By applying, you consent to an AI-conducted screening call
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Similar roles rail (J4) */}
      {similarJobs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-ink-faint" />
            <h2 className="font-display text-base font-bold text-ink">Similar roles</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similarJobs.map(sj => (
              <Link key={sj.id} to={`/portal/jobs/${sj.id}`}
                className="bg-white rounded-card border border-slate-100 shadow-card hover:shadow-pop hover:border-port-200 transition-all p-4 block">
                <p className="text-sm font-semibold text-ink line-clamp-2 leading-snug">{sj.title}</p>
                {sj.company && <p className="text-xs text-ink-faint mt-1 truncate">{sj.company}</p>}
                <div className="flex items-center justify-between mt-2">
                  {sj.location && <p className="text-xs text-ink-faint truncate flex-1">{sj.location}</p>}
                  {sj.salary_min && (
                    <p className="text-xs text-green-600 font-medium flex-shrink-0">₹{sj.salary_min}+ LPA</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchRing({ score }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = score >= 70 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <svg width="56" height="56" className="flex-shrink-0 -rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#F1F5F9" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
    </svg>
  )
}
