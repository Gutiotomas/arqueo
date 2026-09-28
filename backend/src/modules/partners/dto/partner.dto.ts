import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { DateRangeQueryDto } from '../../../common/dto/date-range.dto';
import { PaymentMethod } from '../../../generated/prisma/enums';

export class PartnerDto {
  @ApiProperty({ example: 'Sandra' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la socia es obligatorio' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 50, description: 'Porcentaje de las ganancias que le toca' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100, { message: 'El porcentaje no puede pasar de 100' })
  sharePercent!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DistributionItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'partnerId debe ser un UUID' })
  partnerId!: string;

  @ApiProperty({ example: 150000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Lo que se lleva cada socia debe ser mayor que cero' })
  amount!: number;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description: 'Efectivo sale de la caja; transferencia o tarjeta, de la cuenta; OTHER, de ninguna',
  })
  @IsEnum(PaymentMethod, { message: 'Método de pago inválido' })
  paymentMethod!: PaymentMethod;
}

export class CreateDistributionDto {
  @ApiProperty({ example: '2026-09-28' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ type: [DistributionItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El reparto necesita al menos una socia' })
  @ValidateNested({ each: true })
  @Type(() => DistributionItemDto)
  items!: DistributionItemDto[];

  @ApiPropertyOptional({ example: 'Ganancias de septiembre' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class DistributionQueryDto extends DateRangeQueryDto {}
