import { Module } from "@nestjs/common";
import { ActivityRecorder } from "./activity-recorder";

@Module({
  providers: [ActivityRecorder],
  exports: [ActivityRecorder],
})
export class ActivityModule {}
