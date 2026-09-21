import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dto/business.dto';

@ApiTags('business')
@ApiBearerAuth()
@Controller('business')
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get()
  @ApiOperation({ summary: 'Datos del negocio' })
  find(@CurrentUser('businessId') businessId: string) {
    return this.business.findOne(businessId);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualiza nombre, moneda o zona horaria' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.business.update(businessId, dto);
  }
}
