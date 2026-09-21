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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { DashboardService } from '../dashboard/dashboard.service';
import { CreateLossDto, LossQueryDto, ResolveLossDto } from './dto/loss.dto';
import { LossesService } from './losses.service';

@ApiTags('losses')
@ApiBearerAuth()
@Controller('losses')
export class LossesController {
  constructor(
    private readonly losses: LossesService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mercancía dañada, vencida o perdida' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: LossQueryDto,
  ) {
    return this.losses.findAll(businessId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Cuánto se ha perdido en el periodo y por qué' })
  async summary(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DateRangeQueryDto,
  ) {
    const range = await this.dashboard.resolveRange(
      businessId,
      query.from,
      query.to,
    );
    return { range, ...(await this.losses.summary(businessId, range)) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un registro de pérdida' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.losses.findOne(businessId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra mercancía dañada y la saca del inventario',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLossDto) {
    return this.losses.create(user.businessId, user.userId, dto);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Anota qué hizo el proveedor: repuso gratis, cobrando o no repuso',
  })
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveLossDto,
  ) {
    return this.losses.resolve(user.businessId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra el registro y devuelve la mercancía' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.losses.remove(businessId, id);
  }
}
