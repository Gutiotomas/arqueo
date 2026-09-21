import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import {
  LossReason,
  LossResolution,
  PaymentMethod,
} from '../../../generated/prisma/enums';

export class CreateLossDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'productId debe ser un UUID' })
  productId!: string;

  @ApiProperty({ example: '2026-09-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 3, description: 'Unidades dañadas o perdidas' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @ApiProperty({ enum: LossReason, example: LossReason.DAMAGED })
  @IsEnum(LossReason, { message: 'Motivo inválido' })
  reason!: LossReason;

  @ApiPropertyOptional({
    enum: LossResolution,
    default: LossResolution.PENDING,
    description: 'Qué hizo el proveedor. Si aún no respondió, déjalo en PENDING.',
  })
  @IsOptional()
  @IsEnum(LossResolution, { message: 'Respuesta del proveedor inválida' })
  resolution?: LossResolution;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Lo que cobra el proveedor por cada unidad repuesta',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  replacementUnitCost?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ format: 'uuid', description: 'Proveedor al que se reclama' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Se rompieron tres al bajarlas del camión' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Cuando el proveedor por fin responde. */
export class ResolveLossDto {
  @ApiProperty({ enum: LossResolution })
  @IsEnum(LossResolution, { message: 'Respuesta del proveedor inválida' })
  resolution!: LossResolution;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  replacementUnitCost?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-09-22' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'resolvedAt debe tener formato YYYY-MM-DD' })
  resolvedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class LossQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ enum: LossResolution })
  @IsOptional()
  @IsEnum(LossResolution)
  resolution?: LossResolution;

  @ApiPropertyOptional({ enum: LossReason })
  @IsOptional()
  @IsEnum(LossReason)
  reason?: LossReason;
}
