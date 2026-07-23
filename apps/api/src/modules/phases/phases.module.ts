import { Module } from "@nestjs/common";
import { PhasesRepository } from "./phases.repository";

@Module({
  providers: [PhasesRepository],
  exports: [PhasesRepository],
})
export class PhasesModule {}
