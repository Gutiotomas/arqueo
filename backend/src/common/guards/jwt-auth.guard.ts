import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser, RequestWithUser } from '../decorators/current-user.decorator';

export interface JwtPayload {
  sub: string; // userId
  businessId: string;
  email: string;
}

/**
 * Guard global: todo esta protegido salvo lo marcado con @Public().
 * Es la pieza que hace que ningun endpoint se quede sin auth por descuido.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);

      const user: AuthUser = {
        userId: payload.sub,
        businessId: payload.businessId,
        email: payload.email,
      };
      request.user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o caducado');
    }
  }

  private extractToken(header?: string): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
