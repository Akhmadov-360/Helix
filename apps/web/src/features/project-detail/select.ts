import { projectEventSchema, type ActivityEventResponse, type ProjectEvent } from "@helix/api-schemas";

// select чист (§6.5): узнаёт форму события через projectEventSchema (замкнутый словарь на клиенте),
// но НЕ локализует — payload (в т.ч. LocalizedName у project.moved) остаётся сырым до render.
export type ActivityItem =
  | { id: string; createdAt: string; known: true; event: ProjectEvent }
  | { id: string; createdAt: string; known: false; type: string };

export function toActivityItems(events: ActivityEventResponse[]): ActivityItem[] {
  return events.map((e) => {
    const parsed = projectEventSchema.safeParse({
      type: e.type,
      schemaVersion: e.schemaVersion,
      payload: e.payload,
    });
    return parsed.success
      ? { id: e.id, createdAt: e.createdAt, known: true, event: parsed.data }
      : { id: e.id, createdAt: e.createdAt, known: false, type: e.type };
  });
}
