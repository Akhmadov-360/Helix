import { Module } from "@nestjs/common";
import { AttachmentsModule } from "../attachments/attachments.module";
import { KbModule } from "../kb/kb.module";
import { PagesModule } from "../pages/pages.module";
import { AiChatModule } from "./ai-chat.module";
import { IngestEmbeddingsWorker } from "./ingest-embeddings.worker";

// Отдельный от AiChatModule модуль ровно потому, что воркеру нужны PagesRepository/KbRepository/
// AttachmentsRepository — импортировать их модули отсюда безопасно, т.к. НИКТО не импортирует
// IngestEmbeddingsModule обратно (см. комментарий в ai-chat.module.ts). Единственный потребитель —
// AppModule, воркер сам подписывается на очередь через @Processor, никаких экспортов не нужно.
@Module({
  imports: [AiChatModule, PagesModule, KbModule, AttachmentsModule],
  providers: [IngestEmbeddingsWorker],
})
export class IngestEmbeddingsModule {}
