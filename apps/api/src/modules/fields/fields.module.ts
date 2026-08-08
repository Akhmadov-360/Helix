import { Module } from "@nestjs/common";
import { FieldsRepository } from "./fields.repository";

@Module({
  providers: [FieldsRepository],
  exports: [FieldsRepository],
})
export class FieldsModule {}
