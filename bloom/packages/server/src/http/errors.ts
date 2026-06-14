// Uniform error envelope (matches @bloom/shared ApiErrorSchema).
import type { ErrorCode } from '@bloom/shared';
import type { FastifyReply } from 'fastify';

export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode, message?: string): void {
  reply.code(status).send({ error: { code, message: message ?? code, requestId: reply.request.id } });
}
