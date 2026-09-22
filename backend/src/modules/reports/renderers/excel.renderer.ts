import { Injectable } from '@nestjs/common';
import { Workbook, type Worksheet } from 'exceljs';

import { excelNumberFormat } from '../../../common/utils/format';
import type { ReportData } from '../reports.service';

const AZUL = 'FF1E6091';
const GRIS = 'FFF1F5F9';

/**
 * Excel de verdad, no un CSV disfrazado: cabeceras congeladas, formato de
 * moneda y totales con formulas SUM para que se pueda seguir trabajando el
 * fichero.
 */
@Injectable()
export class ExcelRenderer {
  async render(data: ReportData): Promise<Buffer> {
    const libro = new Workbook();
    libro.creator = 'Arqueo';
    libro.created = new Date(data.generatedAt);

    const formato = excelNumberFormat(data.business.currency);

    this.hojaResumen(libro, data, formato);
    this.hojaPorDia(libro, data, formato);
    this.hojaVentas(libro, data, formato);
    this.hojaGastos(libro, data, formato);
    if (data.cashClosings.length) {
      this.hojaCaja(libro, data, formato);
    }

    const buffer = await libro.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private hojaResumen(
    libro: Workbook,
    data: ReportData,
    formato: string,
  ): void {
    const hoja = libro.addWorksheet('Resumen');
    hoja.columns = [
      { width: 32 },
      { width: 18 },
      { width: 12 },
    ];

    hoja.addRow([data.business.name]).font = { size: 16, bold: true };
    hoja.addRow([data.period.label]).font = { color: { argb: 'FF6B7280' } };
    hoja.addRow([]);

    this.titulo(hoja, 'Resultado del periodo');
    // El mismo orden que en el PDF y en la pantalla de contabilidad.
    const resultado: [string, string, boolean][] = [
      ['Ventas', data.kpis.sales, false],
      ['Costo de la mercancía vendida', `-${data.kpis.cogs}`, false],
      ['Utilidad bruta', data.kpis.grossProfit, true],
      ...(Number(data.kpis.losses) > 0
        ? ([['Mercancía perdida', `-${data.kpis.losses}`, false]] as [
            string,
            string,
            boolean,
          ][])
        : []),
      ['Gastos de operar', `-${data.kpis.expenses}`, false],
      ...(Number(data.kpis.cardFees) > 0
        ? ([['Comisiones del datáfono', `-${data.kpis.cardFees}`, false]] as [
            string,
            string,
            boolean,
          ][])
        : []),
      ['UTILIDAD NETA', data.kpis.profit, true],
    ];
    for (const [etiqueta, valor, destacar] of resultado) {
      const fila = hoja.addRow([etiqueta, Number(valor)]);
      fila.getCell(2).numFmt = formato;
      fila.getCell(1).font = { bold: destacar };
      fila.getCell(2).font = { bold: destacar };
    }

    const margen = hoja.addRow(['Margen bruto', data.kpis.grossMargin / 100]);
    margen.getCell(2).numFmt = '0.0%';
    const ticket = hoja.addRow([
      'Ticket medio',
      Number(data.kpis.averageTicket),
    ]);
    ticket.getCell(2).numFmt = formato;
    hoja.addRow(['Número de ventas', data.kpis.salesCount]);
    hoja.addRow(['Número de gastos', data.kpis.expensesCount]);
    hoja.addRow(['Casos de mercancía perdida', data.kpis.lossesCount]);
    hoja.addRow([]);

    this.titulo(hoja, 'Situación a día de hoy');
    const posicion: [string, string][] = [
      ['Mercancía en inventario (al costo)', data.position.inventoryValue],
      ['Deuda con proveedores', data.position.supplierDebt],
      ['Mercancía comprada en el periodo', data.position.purchases],
      ['Pagado a proveedores en el periodo', data.position.supplierPayments],
    ];
    for (const [etiqueta, valor] of posicion) {
      hoja.addRow([etiqueta, Number(valor)]).getCell(2).numFmt = formato;
    }
    hoja.addRow([]);

    this.titulo(hoja, 'Ventas por forma de pago');
    this.cabecera(hoja, ['Forma de pago', 'Total', '%']);
    for (const fila of data.byPaymentMethod) {
      const row = hoja.addRow([fila.paymentMethod, Number(fila.total), fila.percentage / 100]);
      row.getCell(2).numFmt = formato;
      row.getCell(3).numFmt = '0.0%';
    }
    hoja.addRow([]);

    this.titulo(hoja, 'Gastos por categoría');
    this.cabecera(hoja, ['Categoría', 'Total', '%']);
    for (const fila of data.byExpenseCategory) {
      const row = hoja.addRow([fila.name, Number(fila.total), fila.percentage / 100]);
      row.getCell(2).numFmt = formato;
      row.getCell(3).numFmt = '0.0%';
    }
    hoja.addRow([]);

    if (data.topProducts.length) {
      this.titulo(hoja, 'Productos más vendidos');
      this.cabecera(hoja, ['Producto', 'Cantidad', 'Ingresos', 'Margen']);
      for (const producto of data.topProducts) {
        const row = hoja.addRow([
          producto.name,
          Number(producto.quantity),
          Number(producto.revenue),
          Number(producto.margin),
        ]);
        row.getCell(3).numFmt = formato;
        row.getCell(4).numFmt = formato;
      }
    }
  }

  private hojaPorDia(
    libro: Workbook,
    data: ReportData,
    formato: string,
  ): void {
    const hoja = libro.addWorksheet('Por día');
    hoja.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Ventas', key: 'sales', width: 16 },
      { header: 'Gastos', key: 'expenses', width: 16 },
      { header: 'Beneficio', key: 'profit', width: 16 },
    ];
    this.estiloCabecera(hoja);

    for (const dia of data.daily) {
      hoja.addRow({
        date: dia.date,
        sales: Number(dia.sales),
        expenses: Number(dia.expenses),
        profit: Number(dia.profit),
      });
    }

    this.formatearColumnas(hoja, [2, 3, 4], formato);
    this.filaTotales(hoja, ['B', 'C', 'D'], formato);
  }

  private hojaVentas(
    libro: Workbook,
    data: ReportData,
    formato: string,
  ): void {
    const hoja = libro.addWorksheet('Ventas');
    hoja.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Concepto', key: 'description', width: 40 },
      { header: 'Cantidad', key: 'quantity', width: 12 },
      { header: 'Precio unitario', key: 'unitPrice', width: 16 },
      { header: 'Subtotal', key: 'subtotal', width: 16 },
      { header: 'Forma de pago', key: 'paymentMethod', width: 16 },
      { header: 'Notas', key: 'notes', width: 30 },
    ];
    this.estiloCabecera(hoja);

    // Una fila por linea de venta: asi se puede filtrar y hacer tablas dinamicas.
    for (const venta of data.sales) {
      for (const item of venta.items) {
        hoja.addRow({
          date: venta.date,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          paymentMethod: venta.paymentMethod,
          notes: venta.notes ?? '',
        });
      }
    }

    this.formatearColumnas(hoja, [4, 5], formato);
    this.filaTotales(hoja, ['E'], formato);
  }

  private hojaGastos(
    libro: Workbook,
    data: ReportData,
    formato: string,
  ): void {
    const hoja = libro.addWorksheet('Gastos');
    hoja.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Descripción', key: 'description', width: 40 },
      { header: 'Categoría', key: 'category', width: 20 },
      { header: 'Forma de pago', key: 'paymentMethod', width: 16 },
      { header: 'Importe', key: 'amount', width: 16 },
    ];
    this.estiloCabecera(hoja);

    for (const gasto of data.expenses) {
      hoja.addRow({ ...gasto, amount: Number(gasto.amount) });
    }

    this.formatearColumnas(hoja, [5], formato);
    this.filaTotales(hoja, ['E'], formato);
  }

  private hojaCaja(
    libro: Workbook,
    data: ReportData,
    formato: string,
  ): void {
    const hoja = libro.addWorksheet('Caja');
    hoja.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Apertura', key: 'openingCash', width: 16 },
      { header: 'Esperado', key: 'expectedCash', width: 16 },
      { header: 'Contado', key: 'closingCash', width: 16 },
      { header: 'Diferencia', key: 'difference', width: 16 },
    ];
    this.estiloCabecera(hoja);

    for (const cierre of data.cashClosings) {
      hoja.addRow({
        date: cierre.date,
        openingCash: Number(cierre.openingCash),
        expectedCash: Number(cierre.expectedCash),
        closingCash: Number(cierre.closingCash),
        difference: Number(cierre.difference),
      });
    }

    this.formatearColumnas(hoja, [2, 3, 4, 5], formato);
  }

  // ------------------------------------------------------------------

  private titulo(hoja: Worksheet, texto: string): void {
    const fila = hoja.addRow([texto]);
    fila.font = { bold: true, size: 12, color: { argb: AZUL } };
  }

  private cabecera(hoja: Worksheet, valores: string[]): void {
    const fila = hoja.addRow(valores);
    fila.font = { bold: true };
    fila.eachCell((celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
    });
  }

  private estiloCabecera(hoja: Worksheet): void {
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.eachCell((celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    });
    // La cabecera se queda fija al hacer scroll.
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: hoja.columnCount },
    };
  }

  private formatearColumnas(
    hoja: Worksheet,
    columnas: number[],
    formato: string,
  ): void {
    for (const indice of columnas) {
      hoja.getColumn(indice).numFmt = formato;
    }
  }

  /** Totales con formula, para que sigan cuadrando si se edita el fichero. */
  private filaTotales(
    hoja: Worksheet,
    columnas: string[],
    formato: string,
  ): void {
    const ultima = hoja.rowCount;
    if (ultima < 2) return;

    const fila = hoja.addRow([]);
    fila.getCell(1).value = 'TOTAL';
    fila.font = { bold: true };

    for (const columna of columnas) {
      const celda = fila.getCell(columna);
      celda.value = { formula: `SUM(${columna}2:${columna}${ultima})` };
      celda.numFmt = formato;
    }
  }
}
