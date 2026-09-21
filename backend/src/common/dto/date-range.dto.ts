import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const ISO_DATE_MESSAGE = 'Debe tener formato YYYY-MM-DD';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Desde (inclusive)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `from: ${ISO_DATE_MESSAGE}` })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Hasta (inclusive)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: `to: ${ISO_DATE_MESSAGE}` })
  to?: string;
}
