import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import {
  CreateSaleDto,
  CustomerDto,
  CustomerPaymentDto,
  SaleQueryDto,
  UpdateSaleDto,
} from './dto/sale.dto';
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

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los clientes' })
  findAll(@CurrentUser('businessId') businessId: string) {
    return this.customers.findAll(businessId);
  }

  @Get('debt')
  @ApiOperation({ summary: 'Lo que deben los clientes, quién y desde cuándo' })
  debt(@CurrentUser('businessId') businessId: string) {
    return this.customers.debt(businessId);
  }

  @Get(':id/account')
  @ApiOperation({ summary: 'El cuaderno de un cliente: fiado, cobrado y saldo' })
  account(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.account(businessId, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Cobra una parte o todo de lo que debe el cliente' })
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerPaymentDto,
  ) {
    return this.customers.addPayment(user.businessId, user.userId, id, dto);
  }

  @Delete(':id/payments/:paymentId')
  @ApiOperation({ summary: 'Borra un cobro mal registrado' })
  removePayment(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.customers.removePayment(businessId, id, paymentId);
  }

  @Post()
  @ApiOperation({ summary: 'Da de alta un cliente' })
  create(@CurrentUser('businessId') businessId: string, @Body() dto: CustomerDto) {
    return this.customers.create(businessId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un cliente' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerDto,
  ) {
    return this.customers.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un cliente sin ventas' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.remove(businessId, id);
  }
}
