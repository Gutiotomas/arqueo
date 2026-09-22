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
import {
  CreatePurchaseDto,
  OpeningBalanceDto,
  PurchasePaymentDto,
  PurchaseQueryDto,
  SupplierDto,
} from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';
import { SuppliersService } from './suppliers.service';

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las compras a proveedor con su saldo pendiente' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: PurchaseQueryDto,
  ) {
    return this.purchases.findAll(businessId, query);
  }

  @Get('debt')
  @ApiOperation({ summary: 'Cuánto se debe, a quién, y qué está vencido' })
  debt(@CurrentUser('businessId') businessId: string) {
    return this.purchases.debt(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una compra con sus abonos' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.findOne(businessId, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra una compra: entra al inventario y recalcula el costo promedio',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(user.businessId, user.userId, dto);
  }

  @Post('opening-balance')
  @ApiOperation({
    summary:
      'Apunta una deuda de antes de usar Arqueo (mercancía que ya no está): no mueve el inventario',
  })
  createOpeningBalance(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpeningBalanceDto,
  ) {
    return this.purchases.createOpeningBalance(user.businessId, user.userId, dto);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Abona a la deuda de esta compra' })
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchasePaymentDto,
  ) {
    return this.purchases.addPayment(user.businessId, user.userId, id, dto);
  }

  @Delete(':id/payments/:paymentId')
  @ApiOperation({ summary: 'Borra un abono mal registrado' })
  removePayment(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.purchases.removePayment(businessId, id, paymentId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra la compra y retira la mercancía del inventario' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.purchases.remove(businessId, id);
  }
}

@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los proveedores' })
  findAll(@CurrentUser('businessId') businessId: string) {
    return this.suppliers.findAll(businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Da de alta un proveedor' })
  create(
    @CurrentUser('businessId') businessId: string,
    @Body() dto: SupplierDto,
  ) {
    return this.suppliers.create(businessId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un proveedor' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SupplierDto,
  ) {
    return this.suppliers.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un proveedor sin compras asociadas' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliers.remove(businessId, id);
  }
}
