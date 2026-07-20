import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { ApiResponse } from "@helix/api-schemas";

/**
 * Оборачивает любой успешный ответ контроллера в конверт ApiResponse<T>
 * ({ success, data, timestamp }) — единый контракт (CLAUDE.md). Фронт разворачивает .data.
 * Ошибки идут мимо (их формирует AllExceptionsFilter со своим конвертом).
 */
@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
