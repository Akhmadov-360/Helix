import { Global, Module } from "@nestjs/common";
import { S3Service } from "./s3.service";

/** Глобальный модуль доступа к объектному хранилищу — тот же приём, что PrismaModule. */
@Global()
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class StorageModule {}
