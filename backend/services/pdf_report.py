"""
PDF score report builder using reportlab.
Generates a formatted score card: header, score bars, recommendation badge,
strengths, red flags, and Q&A transcript.
"""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

_REC_COLORS = {
    "HIRE":      colors.HexColor("#16a34a"),
    "SHORTLIST": colors.HexColor("#2563eb"),
    "HOLD":      colors.HexColor("#d97706"),
    "REJECT":    colors.HexColor("#dc2626"),
}

_SCORE_LABELS = [
    ("Overall Score",      "overall_score"),
    ("Skills",             "skills_score"),
    ("Experience",         "experience_score"),
    ("Communication",      "communication_score"),
    ("Culture Fit",        "culture_fit_score"),
    ("Confidence",         "confidence_score"),
]


def _score_bar_table(label: str, score: int) -> Table:
    """Single score row: label | filled bar | number."""
    bar_width = 80 * mm
    fill_width = bar_width * (score / 100)
    empty_width = bar_width - fill_width

    color = colors.HexColor("#16a34a") if score >= 70 else (
        colors.HexColor("#d97706") if score >= 50 else colors.HexColor("#dc2626")
    )

    bar = Table(
        [["", ""]],
        colWidths=[fill_width, empty_width],
        rowHeights=[5 * mm],
    )
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), color),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#e5e7eb")),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    row = Table(
        [[Paragraph(f"<b>{label}</b>", getSampleStyleSheet()["Normal"]), bar, f"{score}/100"]],
        colWidths=[45 * mm, bar_width, 18 * mm],
    )
    row.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    return row


def build_report_pdf(candidate: dict, report: dict, transcript: list) -> bytes:
    """
    Build a PDF score report.
    candidate: dict with keys name, email, phone, jd_title (optional)
    report:    dict with score fields + ai_recommendation + ai_reasoning + strengths + red_flags
    transcript: list of {role, text} dicts
    Returns raw PDF bytes.
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, spaceBefore=10, spaceAfter=4)
    body = styles["Normal"]
    small = ParagraphStyle("small", parent=body, fontSize=9, textColor=colors.HexColor("#6b7280"))
    bubble_ai = ParagraphStyle("bubble_ai", parent=body, fontSize=9,
                               backColor=colors.HexColor("#f3f4f6"), leftIndent=4, rightIndent=4)
    bubble_cand = ParagraphStyle("bubble_cand", parent=body, fontSize=9,
                                 backColor=colors.HexColor("#eff6ff"), leftIndent=4, rightIndent=4)

    story = []

    # ── Header ──────────────────────────────────────────────────────────────────
    rec = (report.get("ai_recommendation") or report.get("hr_override") or "HOLD").upper()
    rec_color = _REC_COLORS.get(rec, colors.gray)

    story.append(Paragraph("AI Screening Report", h1))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
    story.append(Spacer(1, 4 * mm))

    info_data = [
        ["Candidate", candidate.get("name", "—")],
        ["Email",     candidate.get("email", "—")],
        ["Phone",     candidate.get("phone", "—")],
        ["Role",      candidate.get("jd_title") or candidate.get("role", "—")],
    ]
    info_table = Table(info_data, colWidths=[35 * mm, 130 * mm])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 6 * mm))

    # Recommendation badge
    badge_style = ParagraphStyle(
        "badge", parent=body, fontSize=14, textColor=colors.white,
        backColor=rec_color, alignment=1, leftIndent=8, rightIndent=8,
        borderPadding=6,
    )
    story.append(Paragraph(f"AI Recommendation: {rec}", badge_style))
    story.append(Spacer(1, 4 * mm))

    # ── Score bars ───────────────────────────────────────────────────────────────
    story.append(Paragraph("Score Breakdown", h2))
    for label, key in _SCORE_LABELS:
        val = int(report.get(key) or 0)
        story.append(_score_bar_table(label, val))
        story.append(Spacer(1, 1 * mm))
    story.append(Spacer(1, 4 * mm))

    # ── Reasoning ────────────────────────────────────────────────────────────────
    reasoning = report.get("ai_reasoning") or ""
    if reasoning:
        story.append(Paragraph("AI Reasoning", h2))
        story.append(Paragraph(reasoning, body))
        story.append(Spacer(1, 4 * mm))

    # ── Strengths & Red Flags ────────────────────────────────────────────────────
    strengths = report.get("strengths") or []
    red_flags = report.get("red_flags") or []

    if strengths:
        story.append(Paragraph("Strengths", h2))
        for s in strengths:
            story.append(Paragraph(f"• {s}", body))
        story.append(Spacer(1, 3 * mm))

    if red_flags:
        story.append(Paragraph("Red Flags", h2))
        for f in red_flags:
            story.append(Paragraph(f"• {f}", body))
        story.append(Spacer(1, 4 * mm))

    # ── Transcript ───────────────────────────────────────────────────────────────
    if transcript:
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
        story.append(Paragraph("Interview Transcript", h2))
        for turn in transcript:
            role = turn.get("role", "")
            text = turn.get("text", "")
            if role == "ai":
                story.append(Paragraph(f"<b>Interviewer:</b> {text}", bubble_ai))
            else:
                story.append(Paragraph(f"<b>Candidate:</b> {text}", bubble_cand))
            story.append(Spacer(1, 1.5 * mm))

    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Generated by AI Hiring Bot", small))

    doc.build(story)
    return buf.getvalue()
