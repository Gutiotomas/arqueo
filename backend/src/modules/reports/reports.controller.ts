import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';
import { ExcelRenderer } from './renderers/excel.renderer';
import { PdfRenderer } from './renderers/pdf.renderer';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly pdf: PdfRenderer,
    private readonly excel: ExcelRenderer,
  ) {}

  @Get('preview')
  @ApiOperation({
    summary: 'Datos del informe en JSON (lo que la pantalla muestra antes de descargar)',
  })
  async preview(
    @CurrentUser('businessId') businessId: string,
    @Query() query: ReportQueryDto,
  ) {
    const { range, type, label } = await this.reports.resolve(businessId, query);
    return this.reports.build(businessId, range, { type, label });
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Informe en PDF del día, la semana, el mes o un rango' })
  @ApiProduces('application/pdf')
  async pdfReport(
    @CurrentUser('businessId') businessId: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { range, type, label } = await this.reports.resolve(businessId, query);
    const data = await this.reports.build(businessId, range, { type, label });
    const buffer = await this.pdf.render(data);

    this.enviar(res, buffer, this.reports.fileName(data, 'pdf'), 'application/pdf');
  }

  @Get('xlsx')
  @ApiOperation({ summary: 'Informe en Excel del día, la semana, el mes o un rango' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async excelReport(
    @CurrentUser('businessId') businessId: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { range, type, label } = await this.reports.resolve(businessId, query);
    const data = await this.reports.build(businessId, range, { type, label });
    const buffer = await this.excel.render(data);

    this.enviar(
      res,
      buffer,
      this.reports.fileName(data, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  }

  private enviar(
    res: Response,
    buffer: Buffer,
    fileName: string,
    contentType: string,
  ): void {
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
      // El navegador necesita ver la cabecera para nombrar bien la descarga.
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.end(buffer);
  }
}
