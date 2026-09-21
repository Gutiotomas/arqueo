import { Injectable } from '@nestjs/common';
import type {
  Alignment,
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import {
  formatDate,
  formatDateTimeInTimezone,
  formatMoney,
  formatQuantity,
} from '../../../common/utils/format';
import type { ReportData } from '../reports.service';

// pdfmake es CommonJS y sus funciones usan `this` internamente: con
// `import * as` el interop pierde las propiedades y al desestructurar se
// desligan del modulo, asi que se carga con require y se llaman como metodos.
const pdfMake = require('pdfmake') as typeof import('pdfmake');

// Fuentes estandar del PDF: no hay que empaquetar ningun .ttf y aun asi salen
// bien las tildes y las enes.
const FUENTES_ESTANDAR = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
];

pdfMake.setFonts({
  Helvetica: {
    normal: FUENTES_ESTANDAR[0]!,
    bold: FUENTES_ESTANDAR[1]!,
    italics: FUENTES_ESTANDAR[2]!,
    bolditalics: FUENTES_ESTANDAR[3]!,
  },
});

// El informe no carga imagenes ni recursos externos: solo se permiten las
// fuentes estandar que van dentro del propio PDF.
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((ruta) => FUENTES_ESTANDAR.includes(ruta));

const AZUL = '#1e6091';
const VERDE = '#2f9e6b';
const ROJO = '#c0473f';
const GRIS = '#6b7280';
const GRIS_CLARO = '#f1f5f9';

@Injectable()
export class PdfRenderer {
  async render(data: ReportData): Promise<Buffer> {
    const { currency } = data.business;
    const dinero = (valor: string | number) => formatMoney(valor, currency);

    const contenido: Content[] = [
      // Cabecera
      {
        columns: [
          [
            { text: data.business.name, style: 'titulo' },
            { text: data.period.label, style: 'subtitulo' },
          ],
          {
            width: 'auto',
            stack: [
              { text: 'ARQUEO', style: 'marca', alignment: 'right' },
              {
                text: `Generado el ${formatDateTimeInTimezone(
                  data.generatedAt,
                  data.business.timezone,
                )}`,
                style: 'pie',
                alignment: 'right',
              },
            ],
          },
        ],
        margin: [0, 0, 0, 16],
      },

      // Los cuatro numeros que importan
      {
        table: {
          widths: ['*', '*', '*', '*'],
          body: [
            [
              this.kpi('Ventas', dinero(data.kpis.sales), VERDE),
              this.kpi(
                'Utilidad bruta',
                dinero(data.kpis.grossProfit),
                AZUL,
                `${data.kpis.grossMargin}% de margen`,
              ),
              this.kpi('Gastos de operar', dinero(data.kpis.expenses), ROJO),
              this.kpi(
                'Utilidad neta',
                dinero(data.kpis.profit),
                Number(data.kpis.profit) >= 0 ? VERDE : ROJO,
                Number(data.kpis.profit) >= 0 ? 'El negocio gana' : 'El negocio pierde',
              ),
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 6],
      },
      {
        text: `${data.kpis.salesCount} venta(s) y ${data.kpis.expensesCount} gasto(s) en el periodo`,
        style: 'pie',
        margin: [0, 0, 0, 14],
      },

      // De donde sale la utilidad, en el orden de siempre.
      { text: 'Resultado del periodo', style: 'seccion' },
      this.tablaSimple(
        ['Concepto', 'Importe'],
        [
          ['Ventas', dinero(data.kpis.sales)],
          ['Costo de la mercancía vendida', `- ${dinero(data.kpis.cogs)}`],
          ['Utilidad bruta', dinero(data.kpis.grossProfit)],
          // La merma solo aparece si la hubo: una línea a cero es ruido.
          ...(Number(data.kpis.losses) > 0
            ? [
                [
                  `Mercancía perdida (${data.kpis.lossesCount})`,
                  `- ${dinero(data.kpis.losses)}`,
                ],
              ]
            : []),
          ['Gastos de operar', `- ${dinero(data.kpis.expenses)}`],
          ['UTILIDAD NETA', dinero(data.kpis.profit)],
        ],
        '',
      ),
      {
        text: 'La mercancía comprada no figura como gasto: es inventario hasta que se vende.',
        style: 'pie',
        margin: [0, 4, 0, 14],
      },

      { text: 'Situación a día de hoy', style: 'seccion' },
      this.tablaSimple(
        ['Concepto', 'Importe'],
        [
          ['Mercancía en inventario (al costo)', dinero(data.position.inventoryValue)],
          ['Deuda con proveedores', dinero(data.position.supplierDebt)],
          ['Mercancía comprada en el periodo', dinero(data.position.purchases)],
          ['Pagado a proveedores en el periodo', dinero(data.position.supplierPayments)],
        ],
        '',
      ),
      { text: '', margin: [0, 0, 0, 14] },
    ];

    // Desglose por dia (solo si el periodo abarca mas de uno)
    if (data.daily.length > 1) {
      const maximo = Math.max(
        ...data.daily.map((dia) => Math.max(Number(dia.sales), Number(dia.expenses))),
        1,
      );

      contenido.push(
        { text: 'Día a día', style: 'seccion' },
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', 'auto', '*'],
            body: [
              ['Fecha', 'Ventas', 'Gastos', 'Beneficio', ''].map((titulo) =>
                this.th(titulo),
              ),
              ...data.daily.map((dia): TableCell[] => [
                this.td(formatDate(dia.date)),
                this.td(dinero(dia.sales), 'right'),
                this.td(dinero(dia.expenses), 'right'),
                this.td(
                  dinero(dia.profit),
                  'right',
                  Number(dia.profit) >= 0 ? VERDE : ROJO,
                ),
                // Barra proporcional: ver la forma de la semana de un vistazo.
                this.barras(Number(dia.sales), Number(dia.expenses), maximo),
              ]),
            ],
          },
          layout: this.layoutTabla(),
          margin: [0, 0, 0, 16],
        },
      );
    }

    // Formas de pago y categorias de gasto, lado a lado
    contenido.push({
      columns: [
        {
          width: '48%',
          stack: [
            { text: 'Ventas por forma de pago', style: 'seccion' },
            this.tablaSimple(
              ['Forma de pago', 'Total', '%'],
              data.byPaymentMethod.map((fila) => [
                fila.paymentMethod,
                dinero(fila.total),
                `${fila.percentage}%`,
              ]),
              'Sin ventas en el periodo',
            ),
          ],
        },
        { width: '4%', text: '' },
        {
          width: '48%',
          stack: [
            { text: 'Gastos por categoría', style: 'seccion' },
            this.tablaSimple(
              ['Categoría', 'Total', '%'],
              data.byExpenseCategory.map((fila) => [
                fila.name,
                dinero(fila.total),
                `${fila.percentage}%`,
              ]),
              'Sin gastos en el periodo',
            ),
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    });

    if (data.topProducts.length) {
      contenido.push(
        { text: 'Productos más vendidos', style: 'seccion' },
        this.tablaSimple(
          ['Producto', 'Cantidad', 'Ingresos', 'Margen'],
          data.topProducts.map((producto) => [
            producto.name,
            formatQuantity(producto.quantity),
            dinero(producto.revenue),
            dinero(producto.margin),
          ]),
          '',
        ),
        { text: '', margin: [0, 0, 0, 16] },
      );
    }

    if (data.cashClosings.length) {
      contenido.push(
        { text: 'Cierres de caja', style: 'seccion' },
        this.tablaSimple(
          ['Fecha', 'Apertura', 'Esperado', 'Contado', 'Diferencia'],
          data.cashClosings.map((cierre) => [
            formatDate(cierre.date),
            dinero(cierre.openingCash),
            dinero(cierre.expectedCash),
            dinero(cierre.closingCash),
            dinero(cierre.difference),
          ]),
          '',
        ),
        { text: '', margin: [0, 0, 0, 16] },
      );
    }

    // Anexos con el detalle, en pagina aparte
    if (data.sales.length) {
      contenido.push(
        { text: 'Detalle de ventas', style: 'seccion', pageBreak: 'before' },
        this.tablaSimple(
          ['Fecha', 'Concepto', 'Forma de pago', 'Total'],
          data.sales.map((venta) => [
            formatDate(venta.date),
            venta.items
              .map(
                (item) =>
                  `${formatQuantity(item.quantity)} x ${item.description}`,
              )
              .join('\n'),
            venta.paymentMethod,
            dinero(venta.total),
          ]),
          '',
          1,
        ),
        { text: '', margin: [0, 0, 0, 16] },
      );
    }

    if (data.expenses.length) {
      contenido.push(
        { text: 'Detalle de gastos', style: 'seccion' },
        this.tablaSimple(
          ['Fecha', 'Descripción', 'Categoría', 'Forma de pago', 'Importe'],
          data.expenses.map((gasto) => [
            formatDate(gasto.date),
            gasto.description,
            gasto.category,
            gasto.paymentMethod,
            dinero(gasto.amount),
          ]),
          '',
          1,
        ),
      );
    }

    const definicion: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [36, 36, 36, 44],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#111827' },
      styles: {
        titulo: { fontSize: 18, bold: true },
        subtitulo: { fontSize: 11, color: GRIS, margin: [0, 2, 0, 0] },
        marca: { fontSize: 12, bold: true, color: AZUL },
        seccion: { fontSize: 12, bold: true, margin: [0, 0, 0, 6] },
        pie: { fontSize: 8, color: GRIS },
      },
      footer: (pagina: number, total: number) => ({
        columns: [
          { text: data.business.name, style: 'pie', margin: [36, 0, 0, 0] },
          {
            text: `Página ${pagina} de ${total}`,
            style: 'pie',
            alignment: 'right',
            margin: [0, 0, 36, 0],
          },
        ],
      }),
      content: contenido,
    };

    return pdfMake.createPdf(definicion).getBuffer();
  }

  private kpi(
    titulo: string,
    valor: string,
    color: string,
    pie?: string,
  ): TableCell {
    const stack: Content[] = [
      { text: titulo.toUpperCase(), fontSize: 8, color: GRIS },
      { text: valor, fontSize: 13, bold: true, color, margin: [0, 2, 0, 0] },
    ];
    if (pie) {
      stack.push({ text: pie, fontSize: 7, color: GRIS, margin: [0, 1, 0, 0] });
    }

    return { stack, fillColor: GRIS_CLARO, margin: [8, 8, 8, 8] };
  }

  private th(texto: string): TableCell {
    return { text: texto, bold: true, fontSize: 9, color: GRIS };
  }

  private td(
    texto: string,
    alignment: Alignment = 'left',
    color?: string,
  ): TableCell {
    return { text: texto, fontSize: 9, alignment, ...(color ? { color } : {}) };
  }

  /** `columnaAncha` es la del texto largo; las demas se alinean a la derecha. */
  private tablaSimple(
    cabeceras: string[],
    filas: string[][],
    vacio: string,
    columnaAncha = 0,
  ): Content {
    if (!filas.length) {
      return { text: vacio, style: 'pie', margin: [0, 0, 0, 8] };
    }

    return {
      table: {
        headerRows: 1,
        widths: cabeceras.map((_, indice) =>
          indice === columnaAncha ? '*' : 'auto',
        ),
        body: [
          cabeceras.map((titulo) => this.th(titulo)),
          ...filas.map((fila): TableCell[] =>
            fila.map((celda, indice) =>
              this.td(celda, indice === 0 || indice === columnaAncha ? 'left' : 'right'),
            ),
          ),
        ],
      },
      layout: this.layoutTabla(),
    };
  }

  /** Mini-grafico de barras dentro de una celda. */
  private barras(ventas: number, gastos: number, maximo: number): TableCell {
    const ancho = 150;
    return {
      canvas: [
        {
          type: 'rect',
          x: 0,
          y: 2,
          w: Math.max((ventas / maximo) * ancho, 0.5),
          h: 5,
          color: VERDE,
        },
        {
          type: 'rect',
          x: 0,
          y: 9,
          w: Math.max((gastos / maximo) * ancho, 0.5),
          h: 5,
          color: ROJO,
        },
      ],
    };
  }

  private layoutTabla() {
    return {
      hLineWidth: (i: number) => (i <= 1 ? 0.8 : 0.3),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? '#cbd5e1' : '#e5e7eb'),
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: () => 2,
      paddingRight: () => 2,
    };
  }
}
