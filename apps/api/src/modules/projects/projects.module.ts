import { Module } from "@nestjs/common";
import { ProjectsRepository } from "./projects.repository";

@Module({
  providers: [ProjectsRepository],
  exports: [ProjectsRepository],
})
export class ProjectsModule {}
