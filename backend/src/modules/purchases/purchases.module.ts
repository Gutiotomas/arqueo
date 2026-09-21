import { Module } from '@nestjs/common';

import {
  PurchasesController,
  SuppliersController,
} from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [PurchasesController, SuppliersController],
  providers: [PurchasesService, SuppliersService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
