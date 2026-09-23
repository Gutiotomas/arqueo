import { Module } from '@nestjs/common';

import { CustomersService } from './customers.service';
import { CustomersController, SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController, CustomersController],
  providers: [SalesService, CustomersService],
  exports: [SalesService],
})
export class SalesModule {}
