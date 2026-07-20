import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Валидация тела/параметров через Zod-схему из @helix/api-schemas.
 * НЕ class-validator, НЕ DTO-классы (CLAUDE.md).
 *
 * Применяется per-route со схемой в конструкторе — идиоматичный no-DTO паттерн
 * (pipes не видят handler/Reflector, только ArgumentMetadata, поэтому единой
 * APP_PIPE-регистрации без DTO-метатипов нет):
 *
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectInput) { ... }
 *
 * `schema.parse` бросает ZodError → AllExceptionsFilter превращает в 400.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
