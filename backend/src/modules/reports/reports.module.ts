import { Module } from '@nestjs/common';

import { AccountingModule } from '../accounting/accounting.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExcelRenderer } from './renderers/excel.renderer';
import { PdfRenderer } from './renderers/pdf.renderer';
import { SupplierStatementService } from './supplier-statement.service';

@Module({
  imports: [DashboardModule, AccountingModule],
  controllers: [ReportsController],
  providers: [ReportsService, SupplierStatementService, PdfRenderer, ExcelRenderer],
  exports: [PdfRenderer],
})
export class ReportsModule {}
