import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Tienda La Esquina', description: 'Nombre del negocio' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del negocio es obligatorio' })
  @MaxLength(120)
  businessName!: string;

  @ApiProperty({ example: 'Tomas Gutierrez' })
  @IsString()
  @IsNotEmpty({ message: 'Tu nombre es obligatorio' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'dueno@negocio.com' })
  @IsEmail({}, { message: 'Correo inválido' })
  email!: string;

  @ApiProperty({ example: 'unaClaveSegura', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña no puede superar 72 caracteres' })
  password!: string;

  @ApiPropertyOptional({ example: 'COP', default: 'COP' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 'America/Bogota', default: 'America/Bogota' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'demo@arqueo.app' })
  @IsEmail({}, { message: 'Correo inválido' })
  email!: string;

  @ApiProperty({ example: 'demo1234' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72)
  newPassword!: string;
}
