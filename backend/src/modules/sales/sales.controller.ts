import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { CreateSaleDto, SaleQueryDto, UpdateSaleDto } from './dto/sale.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista ventas por rango de fechas y metodo de pago' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: SaleQueryDto,
  ) {
    return this.sales.findAll(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una venta con sus líneas' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.findOne(businessId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registra una venta y descuenta el stock vendido' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.sales.create(user.businessId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplaza la venta entera y recalcula el stock' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.sales.update(user.businessId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra la venta y devuelve el stock al inventario' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sales.remove(businessId, id);
  }
}
