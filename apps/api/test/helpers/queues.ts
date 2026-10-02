import { Queue } from "bullmq";
import { EMAIL_QUEUE, INGEST_EMBEDDINGS_QUEUE, MAINTENANCE_QUEUE } from "../../src/core/queue/queue.module";

// Dev использует logical DB /0 с теми же именами очередей (в т.ч. repeatable cleanup-job'ы) — туда не лезем.
export async function clearTestQueues(redisUrl: string | undefined): Promise<void> {
  if (!redisUrl) {
    throw new Error("REDIS_URL is missing in apps/api/.env.test");
  }
  if (!/\/[1-9]\d*$/.test(redisUrl)) {
    throw new Error(`Refusing to clear queues: REDIS_URL must use a non-zero logical DB (dev uses /0), got: ${redisUrl}`);
  }

  for (const name of [EMAIL_QUEUE, INGEST_EMBEDDINGS_QUEUE, MAINTENANCE_QUEUE]) {
    const queue = new Queue(name, { connection: { url: redisUrl } });
    await queue.obliterate({ force: true });
    await queue.close();
  }
}
