import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
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

export class PurchaseItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'productId debe ser un UUID' })
  productId!: string;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que cero' })
  quantity!: number;

  @ApiProperty({ example: 3200, description: 'Lo que te cobra el proveedor por unidad' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

export class PurchasePaymentDto {
  @ApiProperty({ example: '2026-09-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 200000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El abono debe ser mayor que cero' })
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreatePurchaseDto {
  @ApiProperty({ example: '2026-09-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Proveedor ya registrado' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({
    example: 'Distribuidora El Trigal',
    description: 'Si el proveedor no existe todavia, se crea con este nombre',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'FV-10233' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string;

  @ApiPropertyOptional({
    example: '2026-10-19',
    description: 'Fecha limite para terminar de pagarla',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate debe tener formato YYYY-MM-DD' })
  dueDate?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'La compra necesita al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];

  @ApiPropertyOptional({
    type: PurchasePaymentDto,
    description: 'Lo que pagas en el momento. Si no mandas nada, queda a deber.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PurchasePaymentDto)
  initialPayment?: PurchasePaymentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PurchaseQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({
    enum: ['pending', 'partial', 'paid', 'unpaid'],
    description: 'unpaid = pendientes y parciales, o sea todo lo que aun debes',
  })
  @IsOptional()
  @IsIn(['pending', 'partial', 'paid', 'unpaid'])
  status?: 'pending' | 'partial' | 'paid' | 'unpaid';
}

export class SupplierDto {
  @ApiProperty({ example: 'Distribuidora El Trigal' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre del proveedor es obligatorio' })
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: '300 123 4567' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
