-- pgvector: נדרש לעמודת embedding בקטלוג; SCHEMA public כדי שהטיפוס "vector" יהיה זמין בלי qualification
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "place_id" TEXT,
    "website" TEXT,
    "city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "findings" JSONB NOT NULL,
    "scores" JSONB,
    "narrative" JSONB,
    "llm_cost" DECIMAL(10,4),
    "api_cost" DECIMAL(10,4),
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_messages" (
    "id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "question_key" TEXT,
    "is_free_text" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_models" (
    "id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "field_sources" JSONB NOT NULL,
    "credits" JSONB NOT NULL,
    "completeness_pct" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_items" (
    "id" UUID NOT NULL,
    "roadmap_id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',

    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "briefs" (
    "id" UUID NOT NULL,
    "roadmap_item_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_catalog" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "cost_range" TEXT NOT NULL,
    "saving_range" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "install_time" TEXT NOT NULL,
    "embedding" vector(768),

    CONSTRAINT "opportunity_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benchmarks" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_place_id_key" ON "businesses"("place_id");

-- CreateIndex
CREATE INDEX "diagnoses_business_id_status_idx" ON "diagnoses"("business_id", "status");

-- CreateIndex
CREATE INDEX "scans_diagnosis_id_idx" ON "scans"("diagnosis_id");

-- CreateIndex
CREATE INDEX "interview_messages_diagnosis_id_created_at_idx" ON "interview_messages"("diagnosis_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_models_diagnosis_id_key" ON "business_models"("diagnosis_id");

-- CreateIndex
CREATE INDEX "roadmaps_diagnosis_id_idx" ON "roadmaps"("diagnosis_id");

-- CreateIndex
CREATE INDEX "roadmap_items_roadmap_id_phase_score_idx" ON "roadmap_items"("roadmap_id", "phase", "score" DESC);

-- CreateIndex
CREATE INDEX "roadmap_items_catalog_id_idx" ON "roadmap_items"("catalog_id");

-- CreateIndex
CREATE INDEX "briefs_roadmap_item_id_idx" ON "briefs"("roadmap_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_catalog_name_key" ON "opportunity_catalog"("name");

-- CreateIndex
CREATE INDEX "benchmarks_catalog_id_idx" ON "benchmarks"("catalog_id");

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_models" ADD CONSTRAINT "business_models_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "opportunity_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_roadmap_item_id_fkey" FOREIGN KEY ("roadmap_item_id") REFERENCES "roadmap_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "opportunity_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
