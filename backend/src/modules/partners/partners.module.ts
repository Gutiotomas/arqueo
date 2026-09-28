import { Module } from '@nestjs/common';

import { PartnersController, ProfitDistributionsController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  controllers: [PartnersController, ProfitDistributionsController],
  providers: [PartnersService],
})
export class PartnersModule {}
