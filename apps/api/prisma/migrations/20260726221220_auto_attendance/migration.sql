-- CreateEnum
CREATE TYPE "AutoAttendanceAction" AS ENUM ('ROUTE_TO_DEPARTMENT', 'ROUTE_TO_QUEUE', 'END_CONVERSATION');

-- CreateTable
CREATE TABLE "auto_attendance_flows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "greetingMessage" TEXT,
    "businessHours" JSONB,
    "outOfHoursMessage" TEXT,
    "inactivityTimeoutSecs" INTEGER,
    "inactivityMessage" TEXT,
    "closingMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_attendance_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_attendance_menu_options" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "action" "AutoAttendanceAction" NOT NULL,
    "departmentId" TEXT,
    "queueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_attendance_menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_attendance_flows_companyId_key" ON "auto_attendance_flows"("companyId");

-- CreateIndex
CREATE INDEX "auto_attendance_menu_options_flowId_idx" ON "auto_attendance_menu_options"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "auto_attendance_menu_options_flowId_order_key" ON "auto_attendance_menu_options"("flowId", "order");

-- AddForeignKey
ALTER TABLE "auto_attendance_flows" ADD CONSTRAINT "auto_attendance_flows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_attendance_menu_options" ADD CONSTRAINT "auto_attendance_menu_options_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "auto_attendance_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_attendance_menu_options" ADD CONSTRAINT "auto_attendance_menu_options_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_attendance_menu_options" ADD CONSTRAINT "auto_attendance_menu_options_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "queues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
