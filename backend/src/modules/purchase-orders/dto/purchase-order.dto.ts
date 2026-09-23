import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export class PurchaseOrderItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Producto del inventario. Si va vacio, la linea es libre.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'productId debe ser un UUID' })
  productId?: string;

  @ApiPropertyOptional({
    example: 'Cuajadas',
    description: 'Obligatorio si no hay producto; si lo hay, se usa el nombre del producto.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ example: 6 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @ApiProperty({ example: 6800, description: 'Valor unitario que cobra el proveedor' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: '2026-09-07' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Proveedor ya registrado' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Gustavo', description: 'Proveedor nuevo: se crea sobre la marcha' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  supplierName?: string;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido necesita al menos una línea' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];

  @ApiPropertyOptional({ example: 'Para el lunes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PurchaseOrderQueryDto extends PaginationQueryDto {
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
  supplierId?: string;
}
