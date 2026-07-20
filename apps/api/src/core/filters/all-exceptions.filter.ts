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
