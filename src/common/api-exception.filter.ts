import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorDto } from './api-error.dto';

type HttpErrorBody = {
  error?: string;
  message?: string | string[];
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: HttpErrorBody =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as HttpErrorBody)
        : {};

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse: ApiErrorDto = {
      statusCode,
      error: body.error ?? this.statusLabel(statusCode),
      message:
        body.message ??
        (typeof exceptionResponse === 'string'
          ? exceptionResponse
          : statusCode === HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Internal server error'
            : 'Request failed'),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
    };

    response.status(statusCode).json(errorResponse);
  }

  private statusLabel(statusCode: number): string {
    const label = HttpStatus[statusCode];
    return typeof label === 'string'
      ? label
          .toLowerCase()
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ')
      : 'Error';
  }
}
