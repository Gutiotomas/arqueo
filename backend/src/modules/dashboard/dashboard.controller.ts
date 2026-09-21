import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { DashboardService, type Granularity } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'KPIs del periodo y variación respecto al periodo anterior',
  })
  async summary(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return this.dashboard.summary(businessId, range);
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Ingresos y gastos por día/semana/mes, sin huecos' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  async timeseries(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
    @Query('granularity') granularity: Granularity = 'day',
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    const data = await this.dashboard.timeseries(businessId, range, granularity);
    return { range, granularity, data };
  }

  @Get('sales-by-payment-method')
  @ApiOperation({ summary: 'Reparto de ventas por forma de pago' })
  async salesByPaymentMethod(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return {
      range,
      data: await this.dashboard.salesByPaymentMethod(businessId, range),
    };
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Gastos agrupados por categoría' })
  async expensesByCategory(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return {
      range,
      data: await this.dashboard.expensesByCategory(businessId, range),
    };
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Productos más vendidos del periodo, con su margen' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async topProducts(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
    @Query('limit') limit?: string,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return {
      range,
      data: await this.dashboard.topProducts(
        businessId,
        range,
        limit ? Math.min(Number(limit), 50) : 10,
      ),
    };
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Productos en o por debajo del stock mínimo' })
  lowStock(@CurrentUser('businessId') businessId: string) {
    return this.dashboard.lowStock(businessId);
  }
}
