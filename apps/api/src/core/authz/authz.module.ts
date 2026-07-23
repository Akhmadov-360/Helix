import { Module } from "@nestjs/common";
import { PoliciesGuard } from "./policies.guard";

// PoliciesGuard зависит только от Reflector (глобальный), поэтому переиспользуется
// в любом модуле через @UseGuards без проблем с резолвом зависимостей.
@Module({
  providers: [PoliciesGuard],
  exports: [PoliciesGuard],
})
export class AuthzModule {}
