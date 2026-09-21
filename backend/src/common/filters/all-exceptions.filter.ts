import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Prisma } from '../../generated/prisma/client';

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: unknown;
  path: string;
  timestamp: string;
}

/**
 * Respuesta de error uniforme para todo el API. Traduce ademas los errores de
 * Prisma mas habituales a algo que el frontend pueda mostrar tal cual.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errors } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    message: string;
    errors?: unknown;
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return { status: exception.getStatus(), message: payload };
      }
      const { message, error, ...rest } = payload as Record<string, unknown>;
      return {
        status: exception.getStatus(),
        message: Array.isArray(message)
          ? 'Datos inválidos'
          : String(message ?? error ?? exception.message),
        errors: Array.isArray(message) ? message : rest.errors,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
    };
  }

  private describePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(
          ', ',
        );
        return {
          status: HttpStatus.CONFLICT,
          message: target
            ? `Ya existe un registro con ese valor (${target})`
            : 'Ya existe un registro con esos datos',
        };
      }
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'La referencia indicada no existe',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'No se encontró el registro',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Error de base de datos (${exception.code})`,
        };
    }
  }
}
