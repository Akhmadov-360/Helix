import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { Prisma } from "@helix/db";
import { z, ZodError } from "zod";
import type { Request, Response } from "express";
import {
  BadRequestError,
  ConflictError,
  DomainError,
  ForbiddenError,
  ResourceNotFoundError,
  UnauthorizedError,
} from "../errors/domain-error";

/**
 * ЕДИНСТВЕННОЕ место, где доменная ошибка превращается в HTTP-код.
 *
 * Контроллеры и сервисы не думают о статусах: сервис бросает семантическую ошибку,
 * реестр ниже решает, что это 401/403/409. Добавить новый класс — одна строка здесь
 * плюс сам класс в core/errors.
 *
 * ПОРЯДОК ЗНАЧИМ: проверка идёт через instanceof сверху вниз, поэтому конкретные
 * классы должны стоять ВЫШЕ своих предков. Регистрируем базовые классы — наследники
 * подхватывают маппинг автоматически.
 */
/** `abstract new` — в реестре лежат именно АБСТРАКТНЫЕ базовые классы. */
type DomainErrorClass = abstract new (...args: never[]) => DomainError;

const DOMAIN_ERROR_STATUS: ReadonlyArray<[DomainErrorClass, HttpStatus]> = [
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [ResourceNotFoundError, HttpStatus.NOT_FOUND],
  [BadRequestError, HttpStatus.BAD_REQUEST],
  [ConflictError, HttpStatus.CONFLICT],
];

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  timestamp: string;
}

/**
 * Единый выход ошибок. Доменные ошибки БД → осмысленный HTTP, не 500 (CLAUDE.md):
 *  - FK / Restrict violation (P2003)  → 409 Conflict
 *  - unique violation (P2002)         → 409 Conflict
 *  - record not found (P2025)         → 404 Not Found
 *  - ZodError (валидация)             → 400 Bad Request
 *  - HttpException                    → как есть
 *  - прочее                           → 500 (логируем)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, code, message, details } = this.resolve(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.url} → ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
      timestamp: new Date().toISOString(),
    };
    res.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof DomainError) {
      return {
        status: this.statusForDomainError(exception),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: z.flattenError(exception).fieldErrors,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrisma(exception);
    }

    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      const message =
        typeof resp === "string"
          ? resp
          : ((resp as { message?: string | string[] }).message ?? exception.message);
      return {
        status: exception.getStatus(),
        code: "HTTP_ERROR",
        message: Array.isArray(message) ? message.join(", ") : message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    };
  }

  /**
   * Незарегистрированная доменная ошибка — это дефект: кто-то завёл класс и забыл
   * добавить строку в реестр. Отдаём 500 (безопасный дефолт: лучше «мы сломались»,
   * чем случайно наврать клиенту про причину) и громко пишем в лог.
   */
  private statusForDomainError(error: DomainError): HttpStatus {
    for (const [errorClass, status] of DOMAIN_ERROR_STATUS) {
      if (error instanceof errorClass) return status;
    }

    this.logger.error(
      `Domain error ${error.name} (${error.code}) has no HTTP mapping — add it to DOMAIN_ERROR_STATUS`,
    );
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private mapPrisma(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
  } {
    switch (e.code) {
      case "P2002":
        return { status: HttpStatus.CONFLICT, code: "UNIQUE_VIOLATION", message: "Unique constraint violation" };
      case "P2003":
        return { status: HttpStatus.CONFLICT, code: "FK_VIOLATION", message: "Foreign key / restrict violation" };
      case "P2025":
        return { status: HttpStatus.NOT_FOUND, code: "NOT_FOUND", message: "Record not found" };
      default:
        return { status: HttpStatus.BAD_REQUEST, code: `PRISMA_${e.code}`, message: "Database request error" };
    }
  }
}
