import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { CashClosingsService } from './cash-closings.service';
import {
  CashClosingQueryDto,
  CreateCashClosingDto,
  UpdateCashClosingDto,
} from './dto/cash-closing.dto';

@ApiTags('cash-closings')
@ApiBearerAuth()
@Controller('cash-closings')
export class CashClosingsController {
  constructor(private readonly closings: CashClosingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los cierres de caja' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: CashClosingQueryDto,
  ) {
    return this.closings.findAll(businessId, query);
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Efectivo esperado de un día (apertura + ventas efectivo − gastos efectivo)',
  })
  @ApiQuery({ name: 'date', example: '2026-09-19' })
  @ApiQuery({ name: 'openingCash', required: false, example: 100000 })
  preview(
    @CurrentUser('businessId') businessId: string,
    @Query('date') date: string,
    @Query('openingCash') openingCash?: string,
  ) {
    return this.closings.preview(
      businessId,
      date,
      openingCash !== undefined ? Number(openingCash) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un cierre' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.closings.findOne(businessId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Guarda el cierre de caja del día' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCashClosingDto) {
    return this.closings.create(user.businessId, user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corrige un cierre y recalcula la diferencia' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashClosingDto,
  ) {
    return this.closings.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un cierre de caja' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.closings.remove(businessId, id);
  }
}
