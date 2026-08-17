-- CreateTable
CREATE TABLE "external_calls" (
    "id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "diagnosis_id" UUID,
    "user_id" UUID,
    "ok" BOOLEAN NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_calls_service_created_at_idx" ON "external_calls"("service", "created_at");

-- CreateIndex
CREATE INDEX "external_calls_user_id_created_at_idx" ON "external_calls"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "external_calls_diagnosis_id_idx" ON "external_calls"("diagnosis_id");

