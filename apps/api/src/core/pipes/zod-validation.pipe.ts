import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Валидация тела/query через Zod-схему из @helix/api-schemas (НЕ class-validator, НЕ DTO — CLAUDE.md).
 * Per-route (схема в конструкторе): pipe видит только значение + ArgumentMetadata, не handler/Reflector,
 * поэтому глобальной APP_PIPE-регистрации без DTO-метатипов нет. schema.parse → ZodError → фильтр → 400.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
