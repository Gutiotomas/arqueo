import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PaymentMethod } from '../../../generated/prisma/enums';

export class SaleItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Producto del inventario. Si va vacío, la línea es un concepto libre.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId debe ser un UUID' })
  productId?: string;

  @ApiPropertyOptional({
    example: 'Arreglo de una silla',
    description: 'Obligatorio si no hay producto; si lo hay, se usa el nombre del producto.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateSaleDto {
  @ApiProperty({ example: '2026-09-19', description: 'Día de la venta (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta necesita al menos una línea' })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @ApiPropertyOptional({ example: 'Cliente habitual' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** PUT: reemplaza la venta entera (cabecera y lineas). */
export class UpdateSaleDto extends CreateSaleDto {}

export class SaleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Busca en notas y en la descripción de las líneas' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
