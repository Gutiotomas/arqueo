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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { PdfRenderer } from '../reports/renderers/pdf.renderer';
import { CreatePurchaseOrderDto, PurchaseOrderQueryDto } from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly pedidos: PurchaseOrdersService,
    private readonly pdf: PdfRenderer,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista los pedidos hechos a proveedores' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: PurchaseOrderQueryDto,
  ) {
    return this.pedidos.findAll(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un pedido' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pedidos.findOne(businessId, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'El pedido en PDF, para mandárselo al proveedor' })
  @ApiProduces('application/pdf')
  async pdfPedido(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const pedido = await this.pedidos.findOne(businessId, id);
    const buffer = await this.pdf.renderOrder(pedido);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${this.pedidos.fileName(pedido)}"`,
      'Content-Length': String(buffer.length),
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.end(buffer);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un pedido: no mueve inventario ni deuda' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.pedidos.create(user.businessId, user.userId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Reemplaza el pedido entero; conserva su número' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.pedidos.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un pedido' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pedidos.remove(businessId, id);
  }
}
