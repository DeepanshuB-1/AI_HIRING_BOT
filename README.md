# AI Hiring Bot

An end-to-end AI-powered recruitment platform that automates resume screening, candidate scoring, and live voice interviews via phone call — all running locally with no cloud AI costs.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Starting the System](#starting-the-system)
- [ngrok Setup (Voice Calls)](#ngrok-setup-voice-calls)
- [The 6-Layer AI Pipeline](#the-6-layer-ai-pipeline)
- [Voice Bot Flow](#voice-bot-flow)
- [Candidate Portal Flow](#candidate-portal-flow)
- [HR Dashboard Features](#hr-dashboard-features)
- [Scheduler Jobs](#scheduler-jobs)
- [API Reference](#api-reference)
- [Common Issues](#common-issues)
- [Testing](#testing)
- [Security Notes](#security-notes)

---

## Overview

AI Hiring Bot replaces the manual resume-screening and first-round interview process with a fully automated pipeline:

1. Candidate applies via the portal (or HR uploads a resume)
2. The system parses the resume, scores it against the job description, and generates personalised interview questions
3. If the candidate clears the score threshold, they receive an email invite
4. An AI voice agent calls the candidate, conducts a structured phone interview
5. After the call, the system generates a detailed score report and emails it to HR
6. HR reviews candidates, makes decisions, and the system sends outcome emails

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                        │
│   Twilio (voice calls + SMS)  │  ElevenLabs (TTS)  │  SendGrid │
│   ngrok (public webhook URL)  │  Deepgram (STT)                 │
└───────────────┬──────────────────────────────────┬─────────────┘
                │ webhooks (POST)                  │ emails/SMS
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                    FastAPI Backend  (:8000)                   │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  HR Router  │  │ Voice Router │  │   Portal Router    │  │
│  │  /hr/*      │  │  /voice/*    │  │   /api/portal/*    │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘            │
│                          │                                   │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │               SQLAlchemy (async)  +  pgvector           │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │  APScheduler  (call firing, reminders, cleanup jobs)    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │ Celery tasks (Redis broker)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  Celery Workers                               │
│                                                              │
│  analysis_queue worker                notification_queue     │
│  ├── Layer 1+2: Resume parse + profile extract               │
│  ├── Layer 1.5: pgvector embeddings                          │
│  ├── Layer 3:   JD scoring (vector 40% + LLM 60%)           │
│  ├── Layer 4:   Question generation                          │
│  └── Layer 6:   Post-call report generation                  │
│                              notification_queue worker        │
│                              ├── SendGrid email              │
│                              └── Twilio SMS                  │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   PostgreSQL      Redis         Ollama
   + pgvector    (broker +     (local LLM)
   (:5433)       call state)   (:11434)
                 (:6379)
```

### Voice Call Data Flow

```
HR clicks "Initiate Call"
         │
         ▼
  FastAPI /voice/initiate/{id}
  → Twilio API: place outbound call
  → Twilio calls candidate's phone
         │
         ▼  candidate answers
  Twilio POST → /voice/incoming
  → ElevenLabs TTS: generate opening greeting
  → TwiML: <Play> greeting audio + <Gather> (listen for consent)
         │
         ▼  candidate says "yes, I'm ready"
  Twilio POST → /voice/respond  (SpeechResult via Deepgram nova-2)
  → Ask question 0 directly (no LLM, guaranteed fast)
  → Background: start LLM generating Q1 response
         │
         ▼  candidate answers question
  Twilio POST → /voice/respond
  → Poll Redis for pre-generated LLM response (up to 5s)
  → Return: <Say> backchannel + <Say> next question
  → Background: LLM already generating Q2
         │
         ▼  (repeats for all questions)
         │
         ▼  interview complete
  → <Say> closing + <Hangup/>
  → Celery: run_report_gen (Layer 6)
         │
         ▼
  Twilio POST → /voice/status
  → interview_completed flag? → set candidate to pending_review
  → interrupted?              → reset to scheduled, notify HR
         │
         ▼
  Celery report_gen task:
  → Ollama generates score report
  → Save to ScoreReport table
  → Email HR the full report
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | FastAPI (async), Python 3.11+ |
| **Database** | PostgreSQL 16 + pgvector extension |
| **Cache / Message Broker** | Redis 7 |
| **Task Queue** | Celery 5 (two workers: analysis + notification) |
| **Local LLM** | Ollama — `qwen2.5:7b` (analysis) + `llama3.2:3b` (voice) |
| **Embeddings** | `nomic-embed-text` via Ollama |
| **Voice (outbound calls)** | Twilio Programmable Voice |
| **Speech-to-Text** | Twilio + Deepgram nova-2 (inline in Gather) |
| **Text-to-Speech** | ElevenLabs (`eleven_flash_v2_5`) — falls back to Twilio Alice |
| **Email** | SendGrid |
| **SMS** | Twilio SMS |
| **Scheduler** | APScheduler (AsyncIOScheduler, IST timezone) |
| **Webhook tunnel** | ngrok (free tier — URL changes each session) |
| **PDF reports** | ReportLab |
| **Auth** | JWT (python-jose) + bcrypt password hashing |

---

## Folder Structure

```
AI_HIRING_BOT/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, Ollama warmup
│   ├── config.py                # All settings — read from .env via pydantic-settings
│   ├── database.py              # SQLAlchemy async engine + session
│   ├── auth.py                  # JWT creation/verification, bcrypt
│   ├── celery_app.py            # Celery app definition, two queues
│   ├── scheduler.py             # APScheduler jobs (call firing, reminders, cleanup)
│   ├── tasks.py                 # All Celery task definitions (pipeline layers)
│   ├── redis_client.py          # Singleton Redis connection
│   │
│   ├── models/                  # SQLAlchemy ORM models
│   │   ├── candidate.py         # Candidate, CandidateStatus enum
│   │   ├── job.py               # Job posting
│   │   ├── call.py              # ScreeningCall, CallStatus enum
│   │   ├── report.py            # ScoreReport (post-call AI scores)
│   │   ├── user.py              # HR User (login)
│   │   ├── candidate_user.py    # Candidate portal user account
│   │   ├── notification.py      # HRNotification (bell icon)
│   │   ├── saved_job.py         # Candidate saved jobs
│   │   └── recently_viewed.py   # Recently viewed jobs
│   │
│   ├── routers/
│   │   ├── voice.py             # All Twilio webhook handlers + interview logic
│   │   ├── hr.py                # HR dashboard API (jobs, candidates, analytics)
│   │   ├── portal.py            # Candidate portal API
│   │   ├── auth.py              # HR login/register
│   │   └── question_bank.py     # Question bank management
│   │
│   ├── services/
│   │   ├── resume_parser.py     # PDF/DOCX text extraction (PyMuPDF, python-docx)
│   │   ├── profile_extractor.py # Layer 2: LLM profile extraction → JSON
│   │   ├── embedding_layer.py   # Layer 1.5: pgvector embedding + quick score
│   │   ├── jd_matcher.py        # Layer 3: cosine similarity + LLM JD scoring
│   │   ├── question_gen.py      # Layer 4: personalised question generation
│   │   ├── interview_engine.py  # Layer 5: live conversation logic (opening, next, probe, closing)
│   │   ├── report_gen.py        # Layer 6: post-call report generation
│   │   ├── ollama_client.py     # Ollama API wrapper (analysis + interview models)
│   │   ├── deepgram_stt.py      # Deepgram STT (recording fallback)
│   │   ├── embedder.py          # Embedding utility
│   │   └── pdf_report.py        # ReportLab PDF generation
│   │
│   ├── voice/
│   │   ├── tts.py               # ElevenLabs TTS with MD5 cache
│   │   ├── call_state.py        # Redis-backed per-call state (transcript, questions, etc.)
│   │   └── twilio_client.py     # Twilio outbound call initiation
│   │
│   ├── notifications/
│   │   ├── email.py             # SendGrid send_email()
│   │   ├── sms.py               # Twilio SMS send_sms()
│   │   ├── templates.py         # All HTML email templates
│   │   └── ics.py               # iCalendar (.ics) file builder
│   │
│   └── schemas/                 # Pydantic request/response schemas
│
├── frontend/
│   ├── src/
│   │   ├── pages/               # HR dashboard pages
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Jobs.jsx
│   │   │   ├── Candidates.jsx
│   │   │   ├── CandidateDetail.jsx
│   │   │   ├── Schedule.jsx
│   │   │   ├── Analytics.jsx
│   │   │   ├── Search.jsx       # AI semantic search
│   │   │   └── portal/          # Candidate-facing pages
│   │   ├── components/
│   │   │   ├── Sidebar.jsx      # Nav + notification bell
│   │   │   ├── portal/          # Portal-specific components
│   │   │   └── ui/              # shadcn/ui components
│   │   └── api/
│   │       └── client.js        # Axios API client (hr + portalApi instances)
│   └── package.json
│
├── docker-compose.yml           # PostgreSQL + Redis + Flower (no app containers)
├── requirements.txt
├── .env                         # Secrets — NEVER commit (gitignored)
├── .gitignore
└── START_GUIDE.txt              # Quick terminal-by-terminal startup reference
```

---

## Prerequisites

Install these once before first use.

### 1. Python 3.11+
```
python --version   # must be 3.11 or higher
```

### 2. Node.js 18+
```
node --version     # must be 18 or higher
npm --version
```

### 3. Docker Desktop
Used to run PostgreSQL and Redis.
- Download: https://www.docker.com/products/docker-desktop

### 4. Ollama
Local LLM runtime — no GPU required (CPU works, just slower).
- Download: https://ollama.com/download

After installing, pull the three required models:
```
ollama pull qwen2.5:7b        # analysis, scoring, report generation (~4.7 GB)
ollama pull llama3.2:3b       # live voice interview — fast responses (~2.0 GB)
ollama pull nomic-embed-text  # vector embeddings (~274 MB)
```

### 5. ngrok
Exposes your local FastAPI server to the internet so Twilio can reach your webhooks.
- Download: https://ngrok.com/download
- Sign up for a free account and authenticate:
```
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 6. External API accounts (all free tiers work)

| Service | Purpose | Where to get keys |
|---|---|---|
| **Twilio** | Outbound calls + SMS | twilio.com — get Account SID, Auth Token, phone number |
| **ElevenLabs** | AI voice TTS | elevenlabs.io — get API key + Voice ID |
| **SendGrid** | Email notifications | sendgrid.com — get API key, verify sender email |

---

## Environment Variables

Create a `.env` file in the project root. **Never commit this file — it is already in `.gitignore`.**

```env
# ── Ollama (local — no API key needed) ──────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_ANALYSIS_MODEL=qwen2.5:7b
OLLAMA_INTERVIEW_MODEL=llama3.2:3b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_EMBED_DIMS=768

# ── Database ─────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5433/hiringbot
REDIS_URL=redis://localhost:6379

# ── Twilio ───────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# ── ElevenLabs ───────────────────────────────────────────────────────
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=xxxxxxxxxxxxxxxxxxxxxx

# ── Deepgram (optional — only if using Deepgram recording fallback) ──
DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── SendGrid ─────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=your-verified-sender@yourdomain.com

# ── App ──────────────────────────────────────────────────────────────
SECRET_KEY=change-this-to-a-long-random-string
WEBHOOK_BASE_URL=https://xxxx-xxxx-xxxx.ngrok-free.app   # ← update every session
FRONTEND_URL=http://localhost:5173
UPLOAD_DIR=./uploads
AUDIO_CACHE_DIR=./audio_cache
AUTO_REJECT_THRESHOLD=40       # candidates below this score % are auto-rejected
CALL_RETRY_COUNT=3
CALL_RETRY_INTERVAL_MINUTES=30

# ── Scheduling ───────────────────────────────────────────────────────
SCHEDULER_ENABLED=true
CALL_WINDOW_START=9            # earliest hour to place calls (24h IST)
CALL_WINDOW_END=18             # latest hour to place calls (24h IST)
AUTO_SCHEDULE_INTERVAL_MINUTES=5

# ── Voice timing ─────────────────────────────────────────────────────
MAX_CALL_MINUTES=9             # hard cap — raise to 25 after Twilio trial upgrade
WRAPUP_BUFFER_SECONDS=75       # start wrap-up this many seconds before the cap
QUESTIONS_PER_INTERVIEW=8

# ── Company ──────────────────────────────────────────────────────────
COMPANY_NAME=Your Company Name
HR_EMAIL=you@yourcompany.com   # receives report emails + interruption alerts

# ── Environment ──────────────────────────────────────────────────────
# "development" (default) is permissive. Set to "production" when deploying:
# startup then FAILS FAST on a default SECRET_KEY, a placeholder/non-HTTPS
# WEBHOOK_BASE_URL, or missing Twilio credentials while voice is enabled.
ENVIRONMENT=development
VOICE_ENABLED=true             # set false to run with no Twilio credentials
```

> **WEBHOOK_BASE_URL** must point to your ngrok URL and must be updated every time you restart ngrok (free tier generates a new URL each session). After updating, restart the FastAPI server.

---

## Installation

```powershell
# Clone / open the project folder
cd d:\Internship\AI_HIRING_BOT

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.bat

# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Start the database and Redis
```powershell
docker compose up -d
```
This starts:
- PostgreSQL 16 + pgvector on port `5433`
- Redis 7 on port `6379`
- Flower (Celery monitor) on port `5555`

Database tables are created automatically on first FastAPI startup — no migration step needed.

---

## Starting the System

You need **5 terminal windows** (6 if you want Flower monitoring). Activate the venv in every terminal with `.\venv\Scripts\Activate.bat` before running any command.

### Terminal 1 — FastAPI Backend
```powershell
uvicorn backend.main:app --reload --port 8000
```
Wait for: `DB tables ready | Redis: OK | Scheduler: ON`

Startup also pre-warms both Ollama models and pre-synthesizes 11 static TTS phrases so the first call never hits a cold-start timeout.

| URL | Purpose |
|---|---|
| `http://localhost:8000/docs` | Interactive API docs (Swagger UI) |
| `http://localhost:8000/health` | System health check (DB, Redis, Ollama, Celery) |

### Terminal 2 — Celery Analysis Worker
```powershell
celery -A backend.celery_app worker -Q analysis_queue -P solo --loglevel=info
```
Handles: resume parsing, embeddings, JD scoring, question generation, post-call reports.

`-P solo` keeps concurrency at 1 — Ollama on a single GPU can only run one inference at a time.

### Terminal 3 — Celery Notification Worker
```powershell
celery -A backend.celery_app worker -n notification_worker -Q notification_queue -P solo --loglevel=info
```
Handles: all SendGrid emails and Twilio SMS messages.

### Terminal 4 — React Frontend
```powershell
cd frontend
npm run dev
```
Available at `http://localhost:5173`

### Terminal 5 — ngrok (required for voice calls)
```powershell
ngrok http 8000
```
See [ngrok Setup](#ngrok-setup-voice-calls) below.

### Terminal 6 — Flower (optional task monitor)
```powershell
celery -A backend.celery_app flower --port=5555
```
Available at `http://localhost:5555`

### Quick-reference URLs

| URL | What it is |
|---|---|
| `http://localhost:5173` | HR Dashboard |
| `http://localhost:5173/portal` | Candidate Portal |
| `http://localhost:8000/docs` | API docs |
| `http://localhost:8000/health` | Health check |
| `http://localhost:5555` | Celery task monitor |

---

## ngrok Setup (Voice Calls)

Twilio needs a **public HTTPS URL** to send webhook events to your local FastAPI server. ngrok creates an encrypted tunnel from the internet to your `localhost:8000`.

### Why ngrok is needed

When Twilio places a call, it posts events (call answered, speech transcribed, call ended) to webhook URLs you configure. These webhooks must be reachable from the internet — `localhost:8000` is not. ngrok solves this with a temporary public URL.

### Step-by-step every session

1. **Start ngrok** in a dedicated terminal:
   ```
   ngrok http 8000
   ```

2. **Copy the Forwarding URL** — it looks like:
   ```
   Forwarding  https://abc1-23-45-678-90.ngrok-free.app -> http://localhost:8000
   ```

3. **Update `.env`**:
   ```env
   WEBHOOK_BASE_URL=https://abc1-23-45-678-90.ngrok-free.app
   ```

4. **Restart the FastAPI server** (Ctrl+C in Terminal 1, then run uvicorn again) so it picks up the new URL before placing calls. If you place a call without restarting, Twilio will use the old stale URL and fail.

### Important ngrok limitations (free tier)

- **URL changes every session** — you must repeat steps 2–4 each time you restart ngrok
- **Request rate limit** — avoid making very rapid sequential webhook calls; the free tier will throttle
- **Single simultaneous tunnel** — you cannot run two ngrok tunnels at once on the free tier

### Upgrading to a fixed URL

With a paid ngrok plan you can reserve a static subdomain:
```
ngrok http 8000 --domain=yourdomain.ngrok.app
```
Then `WEBHOOK_BASE_URL` never changes and you never need to restart FastAPI when ngrok restarts.

### Twilio webhook configuration

When you call `POST /voice/initiate/{candidate_id}`, the app calls Twilio's API with these webhook URLs automatically — no manual Twilio dashboard configuration needed:

| Event | URL |
|---|---|
| Call answered | `{WEBHOOK_BASE_URL}/voice/incoming` |
| Speech result | `{WEBHOOK_BASE_URL}/voice/respond` |
| Call status change | `{WEBHOOK_BASE_URL}/voice/status` |

---

## The 6-Layer AI Pipeline

Every candidate upload triggers an automatic async pipeline. Tasks run in `analysis_queue` (one at a time — GPU constraint).

```
Resume Upload (PDF/DOCX)
         │
         ▼
 Layer 1+2 — Profile Extraction                         [Celery: run_profile_extraction]
  PyMuPDF / python-docx → raw text
  Ollama qwen2.5:7b → structured JSON profile
  {name, skills, experience_years, education, projects, ...}
         │
         ▼
 Layer 1.5 — Vector Embeddings                          [Celery: run_embedding_layer]
  nomic-embed-text → 768-dim resume embedding
  nomic-embed-text → 768-dim JD embedding
  Store in pgvector → quick cosine similarity score (40% weight)
         │
         ▼
 Layer 3 — JD Scoring                                   [Celery: run_jd_scoring]
  Two-stage score:
    40% → pgvector cosine similarity (fast, semantic)
    60% → Ollama LLM scoring (deep reasoning)
  Combined overall_score (0–100)
  If score < AUTO_REJECT_THRESHOLD → auto-reject + rejection email
  Else → send interview invite email with consent link
         │
         ▼
 Layer 4 — Question Generation                          [Celery: run_question_gen]
  Ollama generates N personalised questions
  pgvector deduplication (cosine threshold) filters repeated questions
  Questions stored in candidate.questions_json
         │
         ▼
 Layer 5 — Live Voice Interview                         [Real-time, /voice/* endpoints]
  Twilio calls candidate
  ElevenLabs TTS + Twilio Deepgram STT
  Ollama llama3.2:3b drives conversation
  Transcript stored in Redis → DB at call end
         │
         ▼
 Layer 6 — Report Generation                            [Celery: run_report_gen]
  Ollama qwen2.5:7b analyses transcript
  Scores: overall, skills, experience, communication, culture_fit, confidence
  Recommendation: PROCEED / HOLD / REJECT
  Strengths, red flags, next-round questions
  PDF report available for download
  Email report to HR
```

### Pipeline resilience

- Each Celery task has `max_retries=2` with exponential backoff
- If a task fails after all retries, the candidate is marked `status=failed` so HR can see it
- If a voice call is active, CPU/GPU analysis tasks delay themselves by 2 minutes (`retry(countdown=120)`) to avoid competing with the real-time voice pipeline

---

## Voice Bot Flow

### Call lifecycle

```
HR Dashboard → "Initiate Call"
    │
    ▼ POST /voice/initiate/{candidate_id}
Twilio API places outbound call to candidate.phone
    │
    ▼ candidate answers → POST /voice/incoming
Bot: "Hi [Name]! I'm Alex, your AI interviewer from [Company].
      I'll be conducting your screening for [Role]. Are you ready?"
Gather: listen for consent (30s timeout)
    │
    ▼ "Yes I'm ready" → POST /voice/respond
Bot: "Perfect, thanks [Name]! Let's dive right in. [Question 0]"
Background: LLM starts generating Question 1 response
    │
    ▼ candidate answers → POST /voice/respond
Bot: "Right. [LLM-generated transition + Question 1]"
Background: LLM starts generating Question 2 response
    │
    ▼ ... repeats for all questions ...
    │
    ▼ last question answered
Bot: "Thank you so much [Name]! I really appreciated all your answers..."
<Hangup/>
    │
    ▼ POST /voice/status (Twilio fires when call ends)
If interview_completed=True → set candidate to pending_review → run report
If interview_completed=False → interrupted → reset to scheduled → notify HR
```

### Intent detection

Every candidate utterance is classified before the LLM responds:

| Intent | Trigger | Bot response |
|---|---|---|
| `repeat` | "can you repeat", "say that again", "pardon" | Reads the current question again |
| `think` | "give me a moment", "let me think" | "Of course, take all the time you need" + 36s wait |
| `unclear` | Short/unintelligible / filler words only | "I didn't catch that, could you say that again?" (max 2 attempts, then advance) |
| `answer` | Everything else | LLM generates contextual transition + next question |

### Timing constraints

Twilio has a **hard 15-second webhook timeout** — if your server takes longer than 15 seconds to respond, Twilio plays "Application error has occurred" and hangs up.

The bot handles this with:
- **Inline LLM polling** — background task starts LLM generation while Twilio processes the candidate's answer; bot polls Redis for up to 5 seconds, then responds
- **12-second hard ceiling** on `/voice/respond` with a fallback `<Say>` if the budget is exceeded
- **Ollama warmup** on startup — both models are pre-loaded so the first call is fast
- **ElevenLabs TTS cache** — static phrases are pre-synthesized at startup; dynamic phrases are generated with a 4-second timeout before falling back to Twilio's Alice TTS

### ElevenLabs vs Twilio Alice

- **ElevenLabs** is used for: the opening greeting and the first question (high-visibility moments)
- **Twilio Alice** (`<Say voice="alice" language="en-IN">`) is used for: all mid-interview responses, backchannels, closings — this avoids a second audio HTTP fetch inside `<Gather>` which could fail on ngrok's free tier

---

## Candidate Portal Flow

Candidates access the portal at `http://localhost:5173/portal`.

```
/portal/jobs           Browse open roles
/portal/jobs/:id       Job detail + Apply button + Match score (if logged in)
    │
    ▼ Apply
Upload resume (PDF/DOCX) → triggers 6-layer pipeline
    │
    ▼ Pipeline completes
If score ≥ threshold → interview invite email (with consent link)
If score < threshold → rejection email (sent automatically)
    │
    ▼ Candidate clicks consent link (or HR manually calls)
POST /voice/consent/:id → schedule or immediate call
    │
    ▼ Call completes
/portal/my-applications  → see live status updates
```

### Portal features

- **Job board** — browse active listings with search and filters
- **Saved jobs** — bookmark roles for later
- **Recently viewed** — quick access to jobs you've browsed
- **Match score** — AI-powered match percentage for each role (requires login)
- **Similar jobs** — pgvector finds semantically similar roles
- **Application tracker** — real-time status: applied → analyzed → interview scheduled → in call → completed
- **Withdraw application** — candidates can remove their application before the call
- **Profile management** — update name, headline, skills, job alert preferences
- **Daily job alerts** — opt-in email digest of new postings (sent at 09:00 IST)
- **Password reset** — email-based token reset flow

---

## HR Dashboard Features

### Jobs
- Create, edit, and deactivate job postings
- Each job has: title, description, requirements, salary range, location, work type
- Auto-generates the JD text used for scoring

### Candidates
- View all candidates with status badges and match scores
- Filter by job, status, score range
- Bulk reject low-scoring candidates
- Export candidates to CSV
- Retrigger the full pipeline for a candidate (if re-upload or re-score needed)

### Candidate Detail
- Full profile extracted from resume (skills, experience, education)
- Match score breakdown (vector vs LLM score)
- Generated interview questions
- Call transcript
- AI score report (skills, experience, communication, culture fit, confidence)
- HR decision controls: PROCEED / HOLD / REJECT with notes
- Download PDF report
- Play call recording (if Twilio recording is enabled)

### Schedule
- Calendar view of all scheduled screening calls
- Schedule a new call for a candidate at a specific date/time

### Analytics
- Candidate funnel (applied → analyzed → scheduled → completed → accepted/rejected)
- Score distribution histogram
- Role-by-role breakdown
- Pipeline conversion rates

### AI Search
- Semantic search across all candidate profiles using pgvector
- Natural language query: "Python developer with 3+ years Django experience"
- Returns ranked candidates with similarity scores

### Notifications (bell icon)
- In-app notifications when a call is interrupted mid-interview
- Unread count badge, mark-as-read, mark all read
- Clicking a notification navigates to the candidate's profile

---

## Scheduler Jobs

The APScheduler runs inside the FastAPI process (no separate service needed).

| Job | Frequency | What it does |
|---|---|---|
| `fire_scheduled_calls` | Every 1 min | Fires pending calls whose scheduled time has arrived (IST). Respects `MAX_CONCURRENT_CALLS=1` |
| `cleanup_stuck_calls` | Every 5 min | Resets calls stuck in `dialing`/`in_progress` for >15 min (handles crashes/network drops) |
| `send_precall_reminders` | Every 5 min | Sends SMS reminder to candidates whose interview is 25–35 min away |
| `warn_upcoming_calls` | Every 30 min | Logs upcoming calls in the next 2 hours (visibility only) |
| `send_daily_job_alerts` | Daily 09:00 IST | Emails job digest to candidates who opted into job alerts |

The scheduler only fires calls between `CALL_WINDOW_START` and `CALL_WINDOW_END` (default 09:00–18:00 IST).

---

## API Reference

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create HR account |
| POST | `/auth/login` | HR login → JWT token |

### HR — Jobs
| Method | Path | Description |
|---|---|---|
| GET | `/hr/jobs` | List all jobs |
| POST | `/hr/jobs` | Create job |
| GET | `/hr/jobs/:id` | Get job detail |
| PATCH | `/hr/jobs/:id` | Update / deactivate job |

### HR — Candidates
| Method | Path | Description |
|---|---|---|
| GET | `/hr/candidates` | List (filter by job, status, score) |
| POST | `/hr/candidates/upload` | Upload resume → triggers pipeline |
| GET | `/hr/candidates/:id` | Full candidate detail |
| DELETE | `/hr/candidates/:id` | Delete candidate |
| POST | `/hr/candidates/:id/decision` | Set HR decision (PROCEED/HOLD/REJECT) |
| POST | `/hr/candidates/:id/retrigger` | Re-run full pipeline |
| POST | `/hr/candidates/bulk-reject` | Bulk reject by ID list |
| GET | `/hr/candidates/export` | Download CSV export |
| GET | `/hr/candidates/semantic-search` | Natural language candidate search |
| GET | `/hr/candidates/:id/report` | Get score report JSON |
| GET | `/hr/candidates/:id/report.pdf` | Download PDF report |

### HR — Schedule & Notifications
| Method | Path | Description |
|---|---|---|
| GET | `/hr/schedule` | Get scheduled calls for a date |
| GET | `/hr/notifications` | List notifications |
| GET | `/hr/notifications/unread-count` | Unread badge count |
| POST | `/hr/notifications/:id/read` | Mark one as read |
| POST | `/hr/notifications/read-all` | Mark all as read |
| GET | `/hr/analytics` | Dashboard analytics data |

### Voice
| Method | Path | Description |
|---|---|---|
| POST | `/voice/initiate/:id` | Trigger outbound call to candidate |
| GET | `/voice/consent/:id` | Candidate consent landing page |
| POST | `/voice/incoming` | Twilio webhook — call answered |
| POST | `/voice/respond` | Twilio webhook — speech result |
| POST | `/voice/continue` | Internal — fetch pre-generated LLM response |
| POST | `/voice/status` | Twilio webhook — call ended |

### Candidate Portal
| Method | Path | Description |
|---|---|---|
| GET | `/api/portal/jobs` | Public job board |
| GET | `/api/portal/jobs/:id` | Job detail |
| POST | `/api/portal/auth/register` | Candidate registration |
| POST | `/api/portal/auth/login` | Candidate login |
| POST | `/api/portal/apply/:jobId` | Apply with resume |
| GET | `/api/portal/my-applications` | My application statuses |
| DELETE | `/api/portal/apply/:id` | Withdraw application |
| GET | `/api/portal/jobs/:id/match` | AI match score for a role |
| GET | `/api/portal/jobs/:id/similar` | Similar job listings |
| GET/POST | `/api/portal/saved-jobs` | Saved jobs management |
| GET | `/api/portal/recently-viewed` | Recently viewed jobs |
| GET/PATCH | `/api/portal/me` | Profile management |

### Misc
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Full system health (DB, Redis, Ollama, Celery) |
| GET | `/audio/:filename` | Serve cached TTS audio files |

---

## Common Issues

### "Cannot connect to database"
- PostgreSQL is not running. Run `docker compose up -d` from the project root.
- Check that port 5433 is open: `pg_isready -p 5433`
- Verify `DATABASE_URL` in `.env` uses port `5433` (not the default 5432)

### "Redis: UNREACHABLE"
- Redis is not running. Run `docker compose up -d`.
- Check: `redis-cli ping` should return `PONG`

### "Task stuck / pipeline not running"
- Celery analysis worker is not started (Terminal 2 missing)
- Check the Flower dashboard at `http://localhost:5555` to see if workers are online

### "Emails not sending"
- Celery notification worker is not started (Terminal 3 missing)
- `SENDGRID_API_KEY` is missing or wrong in `.env`
- `FROM_EMAIL` must match a verified sender identity in SendGrid
- Gmail addresses as `FROM_EMAIL` require SendGrid sender verification

### "Application error has occurred" during voice call
1. **ngrok is stale** — the most common cause. Restart ngrok, update `WEBHOOK_BASE_URL`, restart FastAPI.
2. **FastAPI took >15 seconds** — check if Ollama is running (`ollama serve`). FastAPI pre-warms models on startup but Ollama itself must already be running.
3. **Twilio trial account limit** — trial accounts can only call verified numbers. Add your number at twilio.com/console/phone-numbers/verified

### "Voice call switches from ElevenLabs to Alice TTS"
ElevenLabs synthesis takes >4 seconds for long or first-time text (the 4s timeout in `_say()` triggers fallback). This is expected behaviour — the call continues normally with Alice TTS. The ElevenLabs voice is reserved for the opening greeting and first question.

### "First voice call is slow"
- faster-whisper downloads the Whisper model (~130 MB for `small.en`) on the very first call
- Ollama models are pre-warmed on FastAPI startup, but Ollama itself must be running first

### "Ollama model not found"
```
ollama pull qwen2.5:7b
ollama pull llama3.2:3b
ollama pull nomic-embed-text
```

### "ngrok URL keeps changing"
This is a free-tier limitation. Each `ngrok http 8000` session gives a new URL. Upgrade to a paid ngrok plan for a fixed domain. Alternatively, use Cloudflare Tunnel (free, persistent URL).

### "venv not found"
```powershell
python -m venv venv
.\venv\Scripts\Activate.bat
pip install -r requirements.txt
```

### Celery tasks not running on Windows
Windows does not support the `fork` concurrency model. Always use `-P solo` for Celery workers on Windows:
```
celery -A backend.celery_app worker -Q analysis_queue -P solo --loglevel=info
```

---

## Testing

The backend suite runs fully offline — Twilio, Ollama, Redis, Celery, SendGrid and the
database are mocked, so no API keys, Docker or network access are needed.

```bash
pip install -r requirements-dev.txt
pytest -q
```

```powershell
# Windows, if pytest is not on PATH
.env\Scripts\python.exe -m pytest -q
```

Frontend production build:

```bash
cd frontend && npm ci && npm run build
```

See **[TESTING.md](TESTING.md)** for the full breakdown of what each test file covers and
how the external-service isolation works. CI (`.github/workflows/ci.yml`) runs both the
backend tests and the frontend build on every push and pull request.

---

## Security Notes

- **Twilio webhooks are signature-validated.** Every Twilio-originated endpoint
  (`/voice/start`, `/respond`, `/continue`, `/continue-probe`, `/status`, `/transcribe`)
  verifies the `X-Twilio-Signature` HMAC using `TWILIO_AUTH_TOKEN` and returns 403 on a
  mismatch, so a third party who discovers your ngrok URL cannot forge call events.
  Candidate consent pages and HR routes are deliberately excluded.
- **Manual call initiation requires HR auth.** `POST /voice/initiate/{id}` is
  authenticated and returns 404 for a candidate belonging to another HR user.
- **Every HR query is tenant-scoped by `hr_user_id`**, including the raw-SQL vector
  searches (semantic search, similar-to-hires, clustering) and duplicate detection.
  Cross-tenant reads return 404 rather than 403 so ownership is not disclosed.
- **Production config is validated at startup.** With `ENVIRONMENT=production` the app
  refuses to boot on a default `SECRET_KEY`, a placeholder or non-HTTPS
  `WEBHOOK_BASE_URL`, or missing Twilio credentials. Error messages name the offending
  setting and never print its value.
- **Only one scheduler instance should run in production.** `start_scheduler()` guards
  against a double start within a process, and call/reminder jobs take a short Redis
  lock, but the lock is best-effort — run a single web process or set
  `SCHEDULER_ENABLED=false` on all but one instance.
- **`.env` is gitignored** and must never be committed. It contains Twilio, ElevenLabs, SendGrid, and database credentials.
- **`deepgram.txt`** is also gitignored — it stores the Deepgram API key in plain text.
- JWT tokens expire and are validated on every HR API request.
- Candidate portal uses a separate JWT (stored as `candidate_token`) — HR tokens and candidate tokens are not interchangeable.
- The `/audio/*` static endpoint serves cached TTS mp3 files — these are public (Twilio must be able to fetch them). Do not store sensitive data in audio filenames.
- Password hashing uses bcrypt via passlib.
- SQL injection is not possible — all queries use SQLAlchemy's parameterised ORM.
