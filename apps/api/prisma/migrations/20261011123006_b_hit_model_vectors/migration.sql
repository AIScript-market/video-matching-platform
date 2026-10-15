-- AlterTable
ALTER TABLE "WorkPerformanceSnapshot" ADD COLUMN     "channelSubscribers" INTEGER,
ADD COLUMN     "positiveComments" INTEGER;

-- CreateTable
CREATE TABLE "ScriptEmbedding" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "embedder" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "sceneCount" INTEGER NOT NULL,
    "pooled" DOUBLE PRECISION[],
    "sceneVectors" DOUBLE PRECISION[],
    "features" JSONB NOT NULL,
    "textHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HitModelVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "embedder" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "labelDefinition" TEXT NOT NULL,
    "trainingPairs" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "artifactPath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "trainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HitModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScriptEmbedding_scriptId_embedder_key" ON "ScriptEmbedding"("scriptId", "embedder");

-- CreateIndex
CREATE UNIQUE INDEX "HitModelVersion_version_key" ON "HitModelVersion"("version");

-- AddForeignKey
ALTER TABLE "ScriptEmbedding" ADD CONSTRAINT "ScriptEmbedding_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
