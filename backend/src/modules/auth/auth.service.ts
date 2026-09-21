import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

/** Categorias con las que arranca cualquier negocio nuevo. */
const CATEGORIAS_GASTO_INICIALES = [
  'Arriendo',
  'Servicios públicos',
  'Nómina',
  'Proveedores',
  'Transporte',
  'Otros',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Da de alta un negocio y su usuario dueño. Por ahora es una cuenta por
   * empresa; el modelo ya admite varios usuarios cuando toque.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existente = await this.prisma.user.findUnique({ where: { email } });
    if (existente) {
      throw new ConflictException('Ese correo ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: dto.businessName.trim(),
          currency: dto.currency?.toUpperCase() ?? 'COP',
          timezone: dto.timezone ?? 'America/Bogota',
          expenseCategories: {
            create: CATEGORIAS_GASTO_INICIALES.map((name) => ({ name })),
          },
        },
      });

      return tx.user.create({
        data: {
          businessId: business.id,
          email,
          name: dto.name.trim(),
          passwordHash,
        },
        include: { business: true },
      });
    });

    return this.buildSession(user.id, user.businessId, user.email, user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });

    // Mismo mensaje para usuario inexistente y clave incorrecta: no damos
    // pistas sobre que correos existen.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    return this.buildSession(user.id, user.businessId, user.email, user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });

    // El token es valido pero el usuario ya no existe (cuenta borrada, base de
    // datos recreada...). Es un 401, no un 404: la sesion ya no sirve y el
    // cliente tiene que cerrarla.
    if (!user) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    return this.publicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
    });

    return { message: 'Contraseña actualizada' };
  }

  private async buildSession(
    userId: string,
    businessId: string,
    email: string,
    user: UserWithBusiness,
  ) {
    // El secreto y la caducidad se configuran en AuthModule.
    const payload: JwtPayload = { sub: userId, businessId, email };
    const accessToken = await this.jwt.signAsync(payload);

    return { accessToken, user: this.publicUser(user) };
  }

  private publicUser(user: UserWithBusiness) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business: {
        id: user.business.id,
        name: user.business.name,
        currency: user.business.currency,
        timezone: user.business.timezone,
      },
    };
  }
}

type UserWithBusiness = {
  id: string;
  name: string;
  email: string;
  role: string;
  businessId: string;
  business: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
};
