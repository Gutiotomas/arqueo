import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({
    enum: ['day', 'week', 'month'],
    description: 'Periodo predefinido. Alternativa: from + to.',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month'], { message: 'period debe ser day, week o month' })
  period?: 'day' | 'week' | 'month';

  @ApiPropertyOptional({
    example: '2026-09-19',
    description: 'Día de referencia del periodo. Por defecto, hoy.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe tener formato YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;
}
