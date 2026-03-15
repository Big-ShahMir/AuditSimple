# SimplyAudit

**An AI-powered forensic audit engine for consumer financial contracts.**

SimplyAudit reads your mortgage, lease, loan, or insurance agreement and tells you — in plain language and exact dollar figures — how much you're overpaying compared to fair-market alternatives. It doesn't tell you what to do. It tells you what you're paying, so *you* can decide.

---

## The Problem

Financial contracts are deliberately opaque. A 40-page mortgage agreement buries an above-market interest rate on page 3, a prepayment penalty on page 27, and a collateral charge (instead of a standard charge) on page 34. Most consumers sign without understanding the true lifetime cost — and the institutions writing these contracts are counting on exactly that.

This is **information asymmetry**: the lender knows precisely what every clause costs you, but you don't. The result is billions of dollars in excess consumer costs across mortgages, auto leases, credit cards, and insurance policies.

### Why not just paste it into ChatGPT?

You *can* paste a contract into an LLM and ask "is this a good deal?" — and you'll get a plausible-sounding answer. Here's what you won't get:

| Capability | Generic LLM | SimplyAudit |
|---|---|---|
| **PII Protection** | Your name, SIN, address, and account numbers are sent directly to OpenAI/Anthropic servers | PII is scrubbed *before* any LLM call using deterministic NER (Microsoft Presidio) — the LLM never sees your personal data |
| **Grounded citations** | "The contract mentions a penalty..." — no page number, no exact quote | Every finding is anchored to a specific page, paragraph, and verbatim quote with a citation chain you can verify |
| **Quantified cost** | "This seems above market" | "Your interest rate is 87 basis points above the Bank of Canada benchmark, costing you an estimated **$14,200** over the remaining term" |
| **Anti-hallucination** | The LLM may invent clauses that don't exist in your contract | Multi-layer verification: citation engine fuzzy-matches every claim back to the source document. If it can't prove it, it can't say it |
| **Structured analysis** | Free-form text response | Deterministic 7-stage pipeline: classify → extract → validate → benchmark → cost → cite → synthesize |
| **Benchmark data** | No access to current market rates | Compares your terms against real benchmark data (Bank of Canada rates, competitive market rates) |
| **Reproducibility** | Same prompt, different answers (temperature, context window) | Deterministic extraction (temperature 0.0), typed state machine, explicit retry logic — same contract produces the same audit |

---

## How It Works

```
Upload PDF → PII Scrubbing → Classify Contract → Extract Clauses → Validate → Benchmark → Calculate Cost of Loyalty → Generate Citations → Synthesize Report
```

1. **Upload** — Drop a PDF contract (mortgage, auto lease, loan, insurance policy, credit card agreement)
2. **PII Scrubbing** — Microsoft Presidio (running as a Docker sidecar) strips all personal information *before* any LLM call. Names become `[PERSON_1]`, SINs become `[SSN_REDACTED]`, addresses become `[ADDRESS_1]`. The mapping is AES-256-GCM encrypted and never leaves your database
3. **Classify** — The AI identifies the contract type (mortgage, auto lease, etc.) to select type-specific extraction templates
4. **Extract Clauses** — Every material clause is extracted with its verbatim text, page location, and numeric value
5. **Validate** — Deterministic plausibility checks (no LLM): Is that interest rate between 0–30%? Is that term under 50 years?
6. **Benchmark** — Each clause is compared against current fair-market rates (Bank of Canada, competitive lender data)
7. **Cost of Loyalty** — The total excess cost of staying with your current contract is calculated with low/mid/high confidence ranges
8. **Citation Verification** — Every finding is fuzzy-matched back to the source document. Unverifiable claims are flagged, not reported
9. **Synthesize** — A plain-language executive summary and 0–100 risk score are generated

The final output is a **Decision Package**: a complete forensic audit, a calculated Cost of Loyalty, and a side-by-side comparison with fair-market alternatives. The system presents all the facts. **You decide.**

---

## Architecture

```
simplyaudit/
├── apps/
│   └── web/                     # Next.js fullstack application
│       ├── app/
│       │   ├── (auth)/          # Sign-in, sign-up, forgot password
│       │   ├── api/             # API routes (upload, audit, auth)
│       │   ├── audit/[id]/      # Audit detail page
│       │   └── dashboard/       # User dashboard
│       ├── lib/
│       │   ├── agents/          # LangGraph.js state machine (7-node pipeline)
│       │   ├── analysis/        # Clause extraction templates & validation rules
│       │   ├── benchmarks/      # Market rate data & comparison logic
│       │   ├── citations/       # Citation verification engine
│       │   └── ingestion/       # Document upload, text extraction, PII scrubbing
│       └── prisma/              # Database schema & migrations
├── packages/
│   └── types/                   # Shared TypeScript interfaces
├── services/
│   └── presidio/                # Dockerized PII detection sidecar (Python)
│       ├── app.py               # Flask/Gunicorn API server
│       ├── recognizers/         # Custom Canadian financial PII recognizers
│       ├── Dockerfile           # Multi-stage Docker build
│       └── requirements.txt     # Python dependencies
└── SYSTEM_DESIGN.md             # Full system design document
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS |
| **Backend** | Next.js API Routes, LangGraph.js state machine |
| **LLM** | Anthropic Claude (classification, extraction, synthesis) |
| **PII Engine** | Microsoft Presidio + spaCy NLP (Docker sidecar) |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | Better Auth (email/password, Google OAuth) |
| **Real-time** | Redis pub/sub (progress events via SSE) |
| **File Storage** | Vercel Blob |
| **Email** | Resend (password resets) |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Docker** (for the Presidio PII sidecar — and optionally PostgreSQL/Redis)
- API keys: Anthropic, Google OAuth credentials, Resend

### 1. Clone & Install

```bash
git clone https://github.com/your-org/simplyaudit.git
cd simplyaudit

# Install the Next.js application
cd apps/web
npm install
```

### 2. Set Up PostgreSQL

SimplyAudit uses PostgreSQL as its primary database. Choose one of these options:

**Option A — Docker (recommended for local dev):**

```bash
docker run -d \
  --name simplyaudit-db \
  -e POSTGRES_USER=simplyaudit \
  -e POSTGRES_PASSWORD=simplyaudit \
  -e POSTGRES_DB=simplyaudit \
  -p 5432:5432 \
  postgres:16
```

Your `DATABASE_URL` will be:
```
postgresql://simplyaudit:simplyaudit@localhost:5432/simplyaudit
```

**Option B — Local PostgreSQL install:**

If you have PostgreSQL installed locally, create the database:

```bash
createdb simplyaudit
```

Your `DATABASE_URL` will be:
```
postgresql://your_user:your_password@localhost:5432/simplyaudit
```

**Option C — Cloud-hosted:**

Use a managed PostgreSQL provider like [Neon](https://neon.tech) (free tier), [Supabase](https://supabase.com), or [Railway](https://railway.app). Copy the connection string they provide as your `DATABASE_URL`.

> **Note:** If using a cloud provider with connection pooling, make sure to use the **direct** connection string (not the pooled URL) for Prisma migrations.

Once your database is running, apply the schema and generate the Prisma client:

```bash
cd apps/web

# Apply all migrations to create the tables
npx prisma migrate deploy

# Generate the Prisma client
npx prisma generate
```

This creates all 8 tables: `User`, `GuestSession`, `Audit`, `Clause`, `Issue`, `PIIRecord`, `BenchmarkRate`, and the Better Auth tables (`Session`, `Account`, `Verification`).

To verify everything is set up correctly:

```bash
npx prisma studio
```

This opens a browser UI at `http://localhost:5555` where you can inspect your tables.

### 3. Set Up Redis

Redis is used for real-time progress streaming (pub/sub) during audit processing. Choose one of these options:

**Option A — Docker:**

```bash
docker run -d \
  --name simplyaudit-redis \
  -p 6379:6379 \
  redis:7-alpine
```

Your `REDIS_URL` will be:
```
redis://localhost:6379
```

**Option B — Cloud-hosted:**

Use [Upstash](https://upstash.com) (free tier, serverless) or [Redis Cloud](https://redis.com/cloud/). Copy the connection string they provide as your `REDIS_URL`.

### 4. Start the PII Sidecar

```bash
cd services/presidio
docker build -t simplyaudit-presidio .
docker run -d --name simplyaudit-presidio -p 5002:5002 simplyaudit-presidio
```

> **Note:** First build downloads the spaCy `en_core_web_lg` model (~560 MB) and will take several minutes. Subsequent builds use the Docker cache.

Verify it's running:

```bash
curl http://localhost:5002/health
# Should return: "healthy"
```

### 5. Configure Environment

Create `apps/web/.env` with all your connection strings and API keys:

```env
# Database (from step 2)
DATABASE_URL="postgresql://simplyaudit:simplyaudit@localhost:5432/simplyaudit"

# Redis (from step 3)
REDIS_URL="redis://localhost:6379"

# Presidio PII Sidecar (from step 4)
PRESIDIO_URL="http://localhost:5002"

# LLM
ANTHROPIC_API_KEY="sk-ant-..."

# Auth
BETTER_AUTH_SECRET="your-random-secret-here"      # Generate with: openssl rand -base64 32
BETTER_AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your-google-client-id"           # From Google Cloud Console
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Email (password resets)
RESEND_API_KEY="re_..."

# File Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_..."
```

### 6. Run the App

```bash
cd apps/web
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Design Philosophy

### "If the AI can't prove it, the AI can't say it."

Every claim in the audit report is traceable back to a specific page, paragraph, and verbatim quote in the source document. The Citation Engine fuzzy-matches every extracted clause against the original text. If the match confidence is below 85%, the finding is flagged as unverified — it's never silently reported as fact.

### "The human decides."

SimplyAudit calculates the **Cost of Loyalty** — the exact dollar premium you pay by staying with your current contract. But it never tells you to switch. A consumer might know their rate is 87 basis points above market. They might also know their credit union funded their first business when no one else would. The *cost* of loyalty is a number. The *value* of loyalty is a story — and stories are not computable. The AI illuminates. The human chooses.

### PII is a hard invariant, not a feature.

Personal information is scrubbed by a deterministic, rule-based system (Microsoft Presidio) *before* any text reaches an LLM. The PII map is AES-256-GCM encrypted at rest and never included in API responses, never logged, and never sent to any external service. This isn't a toggle — it's an architectural invariant.

---

## Supported Contract Types

- Mortgages
- Auto Leases
- Auto Loans
- Credit Card Agreements
- Personal Loans
- Lines of Credit
- Insurance Policies
- Investment Agreements

---

## License

MIT
