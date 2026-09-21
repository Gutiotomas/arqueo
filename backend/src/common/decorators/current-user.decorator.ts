import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Lo que el JwtAuthGuard deja colgado de la request. */
export interface AuthUser {
  userId: string;
  businessId: string;
  email: string;
}

export type RequestWithUser = Request & { user?: AuthUser };

/**
 * Inyecta el usuario autenticado en el controlador:
 *   `@CurrentUser() user: AuthUser`           -> el objeto completo
 *   `@CurrentUser('businessId') id: string`   -> un solo campo
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
