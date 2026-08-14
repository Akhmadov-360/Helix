import { Module } from "@nestjs/common";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AiProviderService } from "./ai-provider.service";
import { EmbeddingChunkRepository } from "./embedding-chunk.repository";
import { IngestEmbeddingsProducer } from "./ingest-embeddings.producer";

// Намеренно БЕЗ IngestEmbeddingsWorker здесь (см. ingest-embeddings.module.ts) — воркеру нужны
// PagesRepository/KbRepository/AttachmentsRepository, а Pages/Kb/AttachmentsModule импортируют
// ЭТОТ модуль ради IngestEmbeddingsProducer. Если бы воркер жил здесь, получился бы цикл:
// AiChatModule → PagesModule → AiChatModule. Разводим на "лёгкий" AiChatModule (producer +
// repository + provider-resolution, без обратных зависимостей на Pages/Kb/Attachments) и
// отдельный IngestEmbeddingsModule (воркер, зависит от всех четырёх — но НИКТО не зависит от него).
@Module({
  imports: [OrganizationsModule],
  providers: [AiProviderService, EmbeddingChunkRepository, IngestEmbeddingsProducer],
  exports: [AiProviderService, IngestEmbeddingsProducer, EmbeddingChunkRepository],
})
export class AiChatModule {}
