import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { DateRangeQueryDto } from '../../../common/dto/date-range.dto';

export class CreateCashClosingDto {
  @ApiProperty({ example: '2026-09-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: 100000, description: 'Efectivo con el que se abrió el día' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCash!: number;

  @ApiProperty({ example: 850000, description: 'Efectivo contado al cerrar' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingCash!: number;

  @ApiPropertyOptional({ example: 'Falto un billete de 10 mil' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCashClosingDto extends PartialType(CreateCashClosingDto) {}

export class CashClosingQueryDto extends DateRangeQueryDto {}
