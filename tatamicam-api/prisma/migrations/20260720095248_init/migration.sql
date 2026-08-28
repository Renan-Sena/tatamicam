-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASIC', 'FEDERATION', 'CONFEDERATION');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ActivationAction" AS ENUM ('ACTIVATE', 'HEARTBEAT', 'TRANSFER', 'REVOKE', 'DEACTIVATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseToken" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "maxMachines" INTEGER NOT NULL DEFAULT 1,
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "hwid" TEXT NOT NULL,
    "label" TEXT,
    "tokenId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationLog" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hwid" TEXT NOT NULL,
    "action" "ActivationAction" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TokenMachines" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TokenMachines_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseToken_code_key" ON "LicenseToken"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_hwid_key" ON "Machine"("hwid");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_tokenId_key" ON "Machine"("tokenId");

-- CreateIndex
CREATE INDEX "_TokenMachines_B_index" ON "_TokenMachines"("B");

-- AddForeignKey
ALTER TABLE "LicenseToken" ADD CONSTRAINT "LicenseToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "LicenseToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationLog" ADD CONSTRAINT "ActivationLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "LicenseToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TokenMachines" ADD CONSTRAINT "_TokenMachines_A_fkey" FOREIGN KEY ("A") REFERENCES "LicenseToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TokenMachines" ADD CONSTRAINT "_TokenMachines_B_fkey" FOREIGN KEY ("B") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
