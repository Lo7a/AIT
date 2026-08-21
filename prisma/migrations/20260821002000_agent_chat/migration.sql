-- ערוץ הסוכנים (הכרעת מייסד 21.8): לוח מצב + תיבת הודעות בין הקלוד של להב לקלוד של
-- אלעד. במסד ולא בריפו, כי הריפו ציבורי ושיח פנימי לא עובר בו. אדיטיבי בלבד, ובזכות
-- ביטול ברירות המחדל (מיגרציית 20260820160000) הטבלאות החדשות נולדות סגורות בפני anon.
CREATE TABLE IF NOT EXISTS "agent_status" (
    "agent" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "areas" TEXT NOT NULL,
    "commit" TEXT,
    "blocked_on" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_status_pkey" PRIMARY KEY ("agent")
);

CREATE TABLE IF NOT EXISTS "agent_messages" (
    "id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "thread" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "read_by" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- המסך והסקריפטים קוראים "האחרונות קודם"
CREATE INDEX IF NOT EXISTS "agent_messages_created_at_idx" ON "agent_messages"("created_at");
