import { Module } from "@nestjs/common";
import { AuditRecorder } from "./audit.recorder";
import { AuditRepository } from "./audit.repository";

// Аналог ActivityModule: и crm (merge), и organizations (membership) пишут аудит — модуль
// живёт отдельно, чтобы organizations не зависел от crm ради одного сервиса.
@Module({
  providers: [AuditRecorder, AuditRepository],
  exports: [AuditRecorder, AuditRepository],
})
export class AuditModule {}
