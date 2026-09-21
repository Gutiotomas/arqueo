import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CategoryDto } from '../../common/dto/category.dto';
import { ProductCategoriesService } from './product-categories.service';

@ApiTags('product-categories')
@ApiBearerAuth()
@Controller('product-categories')
export class ProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las categorías de producto' })
  findAll(@CurrentUser('businessId') businessId: string) {
    return this.categories.findAll(businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una categoría de producto' })
  create(
    @CurrentUser('businessId') businessId: string,
    @Body() dto: CategoryDto,
  ) {
    return this.categories.create(businessId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombra una categoría' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryDto,
  ) {
    return this.categories.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra una categoría sin productos asociados' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categories.remove(businessId, id);
  }
}
