-- CreateTable
CREATE TABLE "ScriptUpload" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScriptUpload_createdAt_idx" ON "ScriptUpload"("createdAt");

-- AddForeignKey
ALTER TABLE "ScriptUpload" ADD CONSTRAINT "ScriptUpload_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptUpload" ADD CONSTRAINT "ScriptUpload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
