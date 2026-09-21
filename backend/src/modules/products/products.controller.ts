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
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  AdjustStockDto,
  CreateProductDto,
  ProductQueryDto,
  StockInDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista productos con filtros y paginación' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.products.findAll(businessId, query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Productos en o por debajo del stock mínimo' })
  lowStock(@CurrentUser('businessId') businessId: string) {
    return this.products.lowStock(businessId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un producto' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.findOne(businessId, id);
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'Historial de movimientos de stock del producto' })
  movements(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.products.movements(businessId, id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un producto (con stock inicial opcional)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.businessId, user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un producto (el stock no se toca aquí)' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(businessId, id, dto);
  }

  @Post(':id/stock-in')
  @ApiOperation({ summary: 'Registra una entrada de mercancía' })
  stockIn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockInDto,
  ) {
    return this.products.stockIn(user.businessId, user.userId, id, dto);
  }

  @Post(':id/adjust-stock')
  @ApiOperation({ summary: 'Fija el stock real tras un conteo físico' })
  adjustStock(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.products.adjustStock(user.businessId, user.userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra el producto, o lo archiva si tiene historial' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.remove(businessId, id);
  }
}
