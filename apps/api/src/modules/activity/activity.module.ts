import { Module } from "@nestjs/common";
import { ActivityRecorder } from "./activity-recorder";
import { ActivityRepository } from "./activity.repository";

@Module({
  providers: [ActivityRecorder, ActivityRepository],
  exports: [ActivityRecorder, ActivityRepository],
})
export class ActivityModule {}
