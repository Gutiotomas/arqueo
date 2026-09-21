import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { AccountingService } from './accounting.service';

@ApiTags('accounting')
@ApiBearerAuth()
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary:
      '¿El negocio gana o pierde? Estado de resultados del periodo más inventario y deuda',
  })
  async overview(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return this.accounting.overview(businessId, range);
  }

  @Get('profit-and-loss')
  @ApiOperation({ summary: 'Solo el estado de resultados del periodo' })
  async profitAndLoss(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return this.accounting.profitAndLoss(businessId, range);
  }
}
