-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "documentUrl" TEXT,
    "mimeType" TEXT,
    "scrubbledText" TEXT,
    "pageTextsJson" TEXT,
    "totalPiiRedacted" INTEGER,
    "entityTypeCounts" TEXT,
    "contractType" TEXT,
    "riskScore" INTEGER,
    "executiveSummary" TEXT,
    "clauses" TEXT,
    "issues" TEXT,
    "costOfLoyalty" TEXT,
    "warnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PIIRecord" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "encryptedPiiMap" BYTEA NOT NULL,

    CONSTRAINT "PIIRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkRate" (
    "id" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "referenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PIIRecord_auditId_key" ON "PIIRecord"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkRate_sourceName_category_asOfDate_key" ON "BenchmarkRate"("sourceName", "category", "asOfDate");

-- AddForeignKey
ALTER TABLE "PIIRecord" ADD CONSTRAINT "PIIRecord_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
