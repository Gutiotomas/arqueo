import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Gaseosa 1.5L' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del producto es obligatorio' })
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'GAS-15' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @ApiPropertyOptional({ example: 'ud', default: 'ud', description: 'ud, kg, lt...' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  unit?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string | null;

  @ApiPropertyOptional({ example: 3500, description: 'Lo que te cuesta a ti' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Lo que cobras al cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ example: 24, description: 'Stock inicial' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 6, description: 'Avisa cuando el stock baje de aqui' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock?: number;
}

/** En la edicion no se toca el stock: para eso estan entrada y ajuste. */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nombre o SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Solo productos por debajo del minimo' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Filtra por activo/archivado' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

export class StockInDto {
  @ApiProperty({ example: 12, description: 'Unidades que entran' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @ApiPropertyOptional({
    example: 3500,
    description: 'Coste unitario de esta compra. Si lo mandas, actualiza el coste del producto.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 'Compra a proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Si la mercancia venia en una compra ya registrada que se quedo corta, la linea de esa compra sube y con ella su total y su deuda.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'purchaseId debe ser un UUID' })
  purchaseId?: string;
}

export class AdjustStockDto {
  @ApiProperty({ example: 18, description: 'Stock real contado (valor absoluto)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({ example: 'Conteo físico de inventario' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Si la diferencia viene de una compra mal apuntada, la linea de esa compra cambia con ella, y con la linea su total y su deuda. Sin esto, solo se mueve el inventario.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'purchaseId debe ser un UUID' })
  purchaseId?: string;
}

/** Pasar stock de un producto a otro: dividir canastas, reempacar. */
export class ConvertStockDto {
  @ApiProperty({ format: 'uuid', description: 'Producto al que pasa la mercancia' })
  @IsUUID('4', { message: 'toProductId debe ser un UUID' })
  toProductId!: string;

  @ApiProperty({ example: 2, description: 'Lo que sale de este producto' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad que sale debe ser mayor que cero' })
  quantity!: number;

  @ApiProperty({ example: 4, description: 'Lo que entra al otro producto' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad que entra debe ser mayor que cero' })
  resultingQuantity!: number;

  @ApiPropertyOptional({ example: 'Se dividieron dos canastas' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
