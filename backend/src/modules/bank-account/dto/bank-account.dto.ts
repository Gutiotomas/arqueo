import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { DateRangeQueryDto } from '../../../common/dto/date-range.dto';
import { AccountMovementType } from '../../../generated/prisma/enums';

export class CreateAccountClosingDto {
  @ApiProperty({ example: '2026-09-22' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 1250000, description: 'Lo que dice la app del banco al cerrar' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  closingBalance!: number;

  @ApiPropertyOptional({ example: 'El banco cobró la cuota de manejo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Del cierre solo se corrige el saldo real y la nota: la fecha marca el orden. */
export class UpdateAccountClosingDto {
  @ApiPropertyOptional({ example: 1250000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  closingBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateAccountMovementDto {
  @ApiProperty({ example: '2026-09-22' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({
    enum: AccountMovementType,
    example: AccountMovementType.CASH_DEPOSIT,
    description:
      'CASH_DEPOSIT: consignaste efectivo de la caja · CASH_WITHDRAWAL: sacaste para la caja · OTHER_IN / OTHER_OUT: aportes o retiros del dueño',
  })
  @IsEnum(AccountMovementType, { message: 'Tipo de movimiento inválido' })
  type!: AccountMovementType;

  @ApiProperty({ example: 300000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'El importe debe ser mayor que cero' })
  amount!: number;

  @ApiPropertyOptional({ example: 'Consignación en Bancolombia' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class AccountQueryDto extends DateRangeQueryDto {}
