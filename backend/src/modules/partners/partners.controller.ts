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
  CreateDistributionDto,
  DistributionQueryDto,
  PartnerDto,
} from './dto/partner.dto';
import { PartnersService } from './partners.service';

@ApiTags('partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly socias: PartnersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las socias y su porcentaje' })
  findAll(@CurrentUser('businessId') businessId: string) {
    return this.socias.findAll(businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Añade una socia' })
  create(@CurrentUser('businessId') businessId: string, @Body() dto: PartnerDto) {
    return this.socias.create(businessId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cambia el nombre o el porcentaje de una socia' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PartnerDto,
  ) {
    return this.socias.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra una socia (o la desactiva si tiene repartos)' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.socias.remove(businessId, id);
  }
}

@ApiTags('profit-distributions')
@ApiBearerAuth()
@Controller('profit-distributions')
export class ProfitDistributionsController {
  constructor(private readonly socias: PartnersService) {}

  @Get()
  @ApiOperation({ summary: 'Repartos de ganancias del periodo' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: DistributionQueryDto,
  ) {
    return this.socias.findDistributions(businessId, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Reparte ganancias: no es un gasto, pero sale de la caja o de la cuenta',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDistributionDto) {
    return this.socias.createDistribution(user.businessId, user.userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un reparto mal registrado' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.socias.removeDistribution(businessId, id);
  }
}
