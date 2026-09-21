import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';
import { LossesController } from './losses.controller';
import { LossesService } from './losses.service';

@Module({
  imports: [DashboardModule],
  controllers: [LossesController],
  providers: [LossesService],
  exports: [LossesService],
})
export class LossesModule {}
