import { useState, useEffect } from 'react'
import { portalGetProfile, portalUpdateProfile } from '../../api/client'
import { useCandidateAuth } from '../../contexts/CandidateAuthContext'
import { useToast } from '../../components/ui/Toast'
import { User, MapPin, Briefcase, Bell, BellOff, CheckCircle2 } from 'lucide-react'

const SKILL_SUGGESTIONS = ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'AWS', 'TypeScript', 'Java', 'Go', 'Docker', 'Kubernetes', 'Machine Learning']

function CompletenessRing({ pct }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const fill = (pct / 100) * circ
  const color = pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#6366F1'
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg width="80" height="80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#F1F5F9" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-ink">
        {pct}%
      </span>
    </div>
  )
}

function completeness(profile) {
  const fields = ['name', 'email', 'phone', 'headline', 'location', 'years_experience', 'skills']
  const filled = fields.filter(f => {
    const v = profile?.[f]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  })
  return Math.round((filled.length / fields.length) * 100)
}

export default function Profile() {
  const { user, setUser } = useCandidateAuth()
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [skillInput, setSkillInput] = useState('')

  useEffect(() => {
    portalGetProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = (field, value) => setProfile(p => ({ ...p, [field]: value }))

  const addSkill = (skill) => {
    const trimmed = skill.trim()
    if (!trimmed) return
    const current = profile?.skills || []
    if (current.includes(trimmed)) return
    set('skills', [...current, trimmed])
    setSkillInput('')
  }

  const removeSkill = (skill) => set('skills', (profile?.skills || []).filter(s => s !== skill))

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await portalUpdateProfile({
        name: profile.name,
        phone: profile.phone,
        headline: profile.headline,
        location: profile.location,
        years_experience: profile.years_experience ? Number(profile.years_experience) : null,
        skills: profile.skills || [],
        job_alerts: profile.job_alerts,
      })
      setProfile(updated)
      if (setUser) setUser(u => ({ ...u, name: updated.name }))
      toast('Profile saved')
    } catch {
      toast('Failed to save profile', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-1/3 bg-slate-100 rounded-lg" />
      <div className="h-48 bg-slate-100 rounded-card" />
    </div>
  )
  if (!profile) return null

  const pct = completeness(profile)
  const missing = []
  if (!profile.phone) missing.push('phone number')
  if (!profile.headline) missing.push('headline')
  if (!profile.location) missing.push('location')
  if (!profile.years_experience) missing.push('years of experience')
  if (!profile.skills?.length) missing.push('skills')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">My Profile</h1>

      {/* Completeness card */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 p-5 flex items-center gap-5">
        <CompletenessRing pct={pct} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">Profile completeness</p>
          {pct < 100 ? (
            <p className="text-xs text-ink-faint mt-0.5 line-clamp-2">
              Add {missing.slice(0, 2).join(' and ')} to boost your profile
            </p>
          ) : (
            <div className="flex items-center gap-1 text-xs text-green-600 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Profile complete
            </div>
          )}
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-port-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-card shadow-card border border-slate-100 divide-y divide-slate-100">
        {/* Basic info */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-brand-50 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="text-sm font-bold text-ink">Basic Information</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Full Name</label>
              <input value={profile.name || ''} onChange={e => set('name', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Email</label>
              <input value={profile.email || ''} readOnly
                className="w-full border border-slate-100 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-ink-soft cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Phone</label>
              <input value={profile.phone || ''} onChange={e => set('phone', e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Headline</label>
              <input value={profile.headline || ''} onChange={e => set('headline', e.target.value)}
                placeholder="e.g. Senior React Engineer"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            </div>
          </div>
        </div>

        {/* Location & experience */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-sm font-bold text-ink">Location & Experience</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Location</label>
              <input value={profile.location || ''} onChange={e => set('location', e.target.value)}
                placeholder="e.g. Bangalore, India"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5 uppercase tracking-wide">Years of Experience</label>
              <input type="number" min="0" max="50" value={profile.years_experience || ''} onChange={e => set('years_experience', e.target.value)}
                placeholder="e.g. 4"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-port-50 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-port-600" />
            </div>
            <h2 className="text-sm font-bold text-ink">Skills</h2>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {(profile.skills || []).map(s => (
              <span key={s} className="inline-flex items-center gap-1 text-xs bg-port-50 text-port-700 border border-port-200 px-2.5 py-1 rounded-pill font-medium">
                {s}
                <button onClick={() => removeSkill(s)} className="hover:text-red-500 ml-0.5 text-port-400">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput) } }}
              placeholder="Add a skill and press Enter"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-port-400" />
            <button onClick={() => addSkill(skillInput)}
              className="text-xs bg-port-600 text-white px-3 py-2 rounded-xl font-semibold hover:bg-port-700 transition-colors">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SKILL_SUGGESTIONS.filter(s => !(profile.skills || []).includes(s)).slice(0, 6).map(s => (
              <button key={s} onClick={() => addSkill(s)}
                className="text-xs text-ink-soft border border-dashed border-slate-200 px-2.5 py-1 rounded-pill hover:border-port-300 hover:text-port-700 transition-colors">
                + {s}
              </button>
            ))}
          </div>
        </div>

        {/* Job alerts toggle (J6) */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
                <Bell className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Daily Job Alerts</p>
                <p className="text-xs text-ink-faint">Get new matching roles delivered to {profile.email} each morning</p>
              </div>
            </div>
            <button onClick={() => set('job_alerts', !profile.job_alerts)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                profile.job_alerts ? 'bg-port-600' : 'bg-slate-200'
              }`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                profile.job_alerts ? 'translate-x-5' : ''
              }`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="bg-port-600 text-white px-6 py-2.5 rounded-card text-sm font-bold hover:bg-port-700 disabled:opacity-50 transition-colors flex items-center gap-2">
          {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}
