"""HTML email + SMS templates for candidate and HR notifications."""


def _first(name: str) -> str:
    parts = name.strip().split()
    return parts[0] if parts else "there"


def consent_sms(name: str, consent_url: str = "") -> str:
    """Short SMS nudge — no URL (link is in the email to avoid segment overflow)."""
    return f"Hi {_first(name)}! You've been shortlisted. Check your email for the interview link."


def unreachable_sms(name: str) -> str:
    return f"Hi {_first(name)}, we couldn't reach you for your interview. Contact HR if interested."


def reschedule_sms(name: str, consent_url: str = "") -> str:
    """Short SMS nudge — no URL (link is in the reschedule email)."""
    return f"Hi {_first(name)}, you missed your interview slot. Check email to reschedule."


def rejection_email_html(name: str, role: str, company: str) -> tuple[str, str]:
    subject = f"Your application for {role} at {company}"
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1f2937">Application Update</h2>
  <p>Dear {name},</p>
  <p>Thank you for your interest in the <strong>{role}</strong> position at <strong>{company}</strong>.</p>
  <p>After carefully reviewing your profile, we have decided to move forward with candidates
  whose experience more closely matches our current requirements.</p>
  <p>We truly appreciate the time you invested in applying and wish you the very best in
  your job search.</p>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html


def interview_invite_email_html(name: str, role: str, company: str, consent_url: str = "") -> tuple[str, str]:
    subject = f"You're shortlisted! Book your AI interview — {role} at {company}"
    book_button = f"""
  <p style="margin:24px 0">
    <a href="{consent_url}"
       style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;
              text-decoration:none;font-weight:bold;display:inline-block">
      Book My Interview Slot
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px">Or copy this link: {consent_url}</p>""" if consent_url else ""
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#16a34a">Congratulations, {name}!</h2>
  <p>Your application for <strong>{role}</strong> at <strong>{company}</strong> has been shortlisted.</p>
  <p>Please click the button below to book your AI screening call slot.
  The call takes approximately <strong>15–20 minutes</strong>.</p>
  {book_button}
  <h3>Tips for the call:</h3>
  <ul>
    <li>Find a quiet place with good phone reception</li>
    <li>Have your resume nearby for reference</li>
    <li>Speak clearly and take your time — the AI will wait for you</li>
    <li>The interviewer will introduce itself as an AI at the start of the call</li>
  </ul>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html


def reschedule_email_html(name: str, role: str, company: str, consent_url: str) -> tuple[str, str]:
    subject = f"Reschedule your AI interview — {role} at {company}"
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#d97706">Interview Slot Missed — {name}</h2>
  <p>You missed your scheduled AI screening call for <strong>{role}</strong> at <strong>{company}</strong>.</p>
  <p>You can book a new slot using the link below:</p>
  <p style="margin:24px 0">
    <a href="{consent_url}"
       style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;
              text-decoration:none;font-weight:bold;display:inline-block">
      Reschedule My Interview
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px">Or copy this link: {consent_url}</p>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html


def hr_report_email_html(
    candidate_name: str,
    role: str,
    overall_score: int,
    recommendation: str,
    reasoning: str,
    strengths: list,
    red_flags: list,
    next_round_questions: list,
    company: str,
) -> tuple[str, str]:
    subject = f"[Screening Report] {candidate_name} — {role} | {recommendation}"
    color_map = {
        "HIRE": "#16a34a",
        "SHORTLIST": "#2563eb",
        "HOLD": "#d97706",
        "REJECT": "#dc2626",
    }
    color = color_map.get(recommendation, "#6b7280")

    strengths_html = "".join(f"<li>{s}</li>" for s in (strengths or []))
    flags_html = "".join(f"<li>{f}</li>" for f in (red_flags or []))
    questions_html = "".join(f"<li>{q}</li>" for q in (next_round_questions or []))

    html = f"""
<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px">
  <h2 style="color:#1f2937">Post-Screening Report</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:8px;font-weight:bold">Candidate</td><td>{candidate_name}</td></tr>
    <tr style="background:#f9fafb"><td style="padding:8px;font-weight:bold">Role</td><td>{role}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">Overall Score</td><td><strong>{overall_score}/100</strong></td></tr>
    <tr style="background:#f9fafb">
      <td style="padding:8px;font-weight:bold">AI Recommendation</td>
      <td><span style="color:{color};font-weight:bold;font-size:16px">{recommendation}</span></td>
    </tr>
  </table>
  <h3>Reasoning</h3>
  <p style="color:#374151">{reasoning}</p>
  <h3 style="color:#16a34a">Strengths</h3>
  <ul>{strengths_html}</ul>
  <h3 style="color:#dc2626">Red Flags</h3>
  <ul>{flags_html if flags_html else "<li>None identified</li>"}</ul>
  <h3>Suggested Next-Round Questions</h3>
  <ul>{questions_html}</ul>
  <hr style="margin:24px 0">
  <p style="color:#6b7280;font-size:12px">
    Generated by {company} AI Hiring Bot. Review the full transcript in the HR dashboard.
  </p>
</div>"""
    return subject, html


def hire_email_html(name: str, role: str, company: str) -> tuple[str, str]:
    subject = f"Congratulations! You've been selected — {role} at {company}"
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;border-radius:8px;margin-bottom:20px">
    <h2 style="color:#15803d;margin:0">Congratulations, {_first(name)}! 🎉</h2>
  </div>
  <p>Dear {name},</p>
  <p>We are thrilled to inform you that after reviewing your application and AI screening for
  the <strong>{role}</strong> position at <strong>{company}</strong>, we have decided to
  <strong style="color:#15803d">move forward with your candidacy</strong>.</p>
  <p>Our HR team will be in touch shortly with the next steps, including details about
  compensation, start date, and onboarding.</p>
  <p>Welcome to the team — we can't wait to work with you!</p>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html


def shortlist_email_html(name: str, role: str, company: str) -> tuple[str, str]:
    subject = f"Great news! You've been shortlisted for the next round — {role} at {company}"
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;border-radius:8px;margin-bottom:20px">
    <h2 style="color:#1d4ed8;margin:0">You've Been Shortlisted, {_first(name)}!</h2>
  </div>
  <p>Dear {name},</p>
  <p>Excellent news — your performance in the AI screening for <strong>{role}</strong> at
  <strong>{company}</strong> has impressed us, and you have been
  <strong style="color:#1d4ed8">shortlisted for the next round</strong> of our interview process.</p>
  <p>Our HR team will contact you soon to arrange the next interview. Please keep an eye on
  your inbox and phone for further instructions.</p>
  <p>Well done, and we look forward to speaking with you again!</p>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html


def hold_email_html(name: str, role: str, company: str) -> tuple[str, str]:
    subject = f"Your application status — {role} at {company}"
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1f2937">Application Update</h2>
  <p>Dear {name},</p>
  <p>Thank you for completing the screening interview for <strong>{role}</strong> at
  <strong>{company}</strong>. We appreciate the time you invested.</p>
  <p>We are currently reviewing all candidates and your application is being
  <strong>kept on hold</strong> while we finalise our shortlist. We will get back to you
  within the next 5–7 business days with an update.</p>
  <p>Thank you for your patience.</p>
  <p>Best regards,<br><strong>The {company} Recruitment Team</strong></p>
</div>"""
    return subject, html
