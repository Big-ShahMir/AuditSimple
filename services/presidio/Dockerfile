# ---------------------------------------------------------------------------
# Stage 1: Install Python dependencies and download the spaCy model
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the large English NER model (~560 MB).
# en_core_web_lg is required — en_core_web_sm has significantly worse accuracy
# for person names and addresses, which are the most critical PII types.
RUN python -m spacy download en_core_web_lg

# ---------------------------------------------------------------------------
# Stage 2: Slim runtime image
# ---------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# Copy installed site-packages and CLI tools from the builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Install curl for the HEALTHCHECK command (not present in slim base)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy application source
COPY . .

EXPOSE 5002

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:5002/health || exit 1

# 4 workers, 120-second timeout.
# Financial documents can be long — a single /analyze on a 100-page document
# may take 30-60 seconds. The timeout prevents premature worker kills while the
# worker count prevents one slow request from blocking all traffic.
CMD ["gunicorn", "app:app", \
     "--bind", "0.0.0.0:5002", \
     "--workers", "4", \
     "--timeout", "120", \
     "--log-level", "info"]
