-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
-- CreateIndex
CREATE INDEX "Workspace_orgId_idx" ON "Workspace"("orgId");
-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
-- CreateIndex
CREATE INDEX "ProjectAssignee_userId_idx" ON "ProjectAssignee"("userId");
-- CreateIndex
CREATE INDEX "Task_orgId_idx" ON "Task"("orgId");
-- CreateIndex
CREATE INDEX "Blueprint_orgId_idx" ON "Blueprint"("orgId");
-- CreateIndex
CREATE INDEX "Attachment_orgId_idx" ON "Attachment"("orgId");
-- CreateIndex
CREATE INDEX "Page_orgId_idx" ON "Page"("orgId");
