-- לוח המשימות (הכרעת מייסד 21.8): משימות, באגים ורעיונות עם עדיפות, סטטוס, אחראי
-- וקישור לקומיטים; task_events עונה על "מי שינה מה ומתי". אדיטיבי בלבד, והטבלאות
-- נולדות סגורות בפני anon (ביטול ברירות המחדל, מיגרציית 20260820160000).
CREATE TABLE IF NOT EXISTS "tasks" (
    "id" UUID NOT NULL,
    "num" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "assignee" TEXT,
    "blocked_on" TEXT,
    "commits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_num_key" ON "tasks"("num");
-- המסך והכלים ממיינים לפי "מה פתוח ומה בוער"
CREATE INDEX IF NOT EXISTS "tasks_status_priority_idx" ON "tasks"("status", "priority");

CREATE TABLE IF NOT EXISTS "task_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "task_events_task_id_created_at_idx" ON "task_events"("task_id", "created_at");
