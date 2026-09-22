import { costoPromedioPonderado, costoSinLaCompra } from './cost';

describe('costo promedio ponderado', () => {
  it('mezcla lo que habia con lo que entra', () => {
    // 10 a 3.000 + 10 a 4.000 = 20 a 3.500
    expect(costoPromedioPonderado(10, 3000, 10, 4000).toFixed(2)).toBe('3500.00');
  });

  it('pondera segun las cantidades, no a partes iguales', () => {
    // 90 a 1.000 + 10 a 2.000 = 100 a 1.100
    expect(costoPromedioPonderado(90, 1000, 10, 2000).toFixed(2)).toBe('1100.00');
  });

  it('sin existencias, el costo es el de la compra', () => {
    expect(costoPromedioPonderado(0, 3000, 5, 4500).toFixed(2)).toBe('4500.00');
  });

  it('con stock en negativo tampoco promedia', () => {
    // Se vendio mas de lo que habia: no hay inventario que valorar.
    expect(costoPromedioPonderado(-4, 3000, 10, 5000).toFixed(2)).toBe('5000.00');
  });

  it('una entrada vacia deja el costo como estaba', () => {
    expect(costoPromedioPonderado(10, 3000, 0, 9999).toFixed(2)).toBe('3000.00');
  });

  it('mantiene la precision con cifras grandes en pesos', () => {
    expect(costoPromedioPonderado(3, 1250000, 1, 1300000).toFixed(2)).toBe(
      '1262500.00',
    );
  });
});

describe('costo al borrar una compra', () => {
  it('sin nada que entrara despues, vuelve al costo de antes', () => {
    // Habia 10 a 3.000; entraron 10 a 30.000 por error (costo 16.500).
    expect(
      costoSinLaCompra({
        stockActual: 20,
        costoActual: 16500,
        cantidad: 10,
        valorCompra: 300000,
        costoAnterior: 3000,
        entroMasDespues: false,
      }).toFixed(2),
    ).toBe('3000.00');
  });

  it('vuelve al costo de antes aunque no quede nada en existencia', () => {
    // Producto creado con costo 2.500 y stock 0, y una compra mal apuntada.
    expect(
      costoSinLaCompra({
        stockActual: 5,
        costoActual: 40000,
        cantidad: 5,
        valorCompra: 200000,
        costoAnterior: 2500,
        entroMasDespues: false,
      }).toFixed(2),
    ).toBe('2500.00');
  });

  it('las ventas de en medio no cambian el costo al que se vuelve', () => {
    // 10 a 1.000 + 10 a 3.000 = 20 a 2.000; se venden 5. Volver a 1.000,
    // no a (15 x 2.000 - 30.000) / 5 = 0.
    expect(
      costoSinLaCompra({
        stockActual: 15,
        costoActual: 2000,
        cantidad: 10,
        valorCompra: 30000,
        costoAnterior: 1000,
        entroMasDespues: false,
      }).toFixed(2),
    ).toBe('1000.00');
  });

  it('si entro otra compra despues, queda el promedio como si esta no existiera', () => {
    // 10 a 1.000, compra A: 10 a 3.000 (20 a 2.000), compra B: 20 a 4.000
    // (40 a 3.000). Sin A habria sido 10 a 1.000 + 20 a 4.000 = 30 a 3.000.
    expect(
      costoSinLaCompra({
        stockActual: 40,
        costoActual: 3000,
        cantidad: 10,
        valorCompra: 30000,
        costoAnterior: 1000,
        entroMasDespues: true,
      }).toFixed(2),
    ).toBe('3000.00');
  });

  it('una compra vieja sin costo anterior guardado saca su valor del promedio', () => {
    // 10 a 3.000 + 10 a 4.000 = 20 a 3.500; sin la segunda, 10 a 3.000.
    expect(
      costoSinLaCompra({
        stockActual: 20,
        costoActual: 3500,
        cantidad: 10,
        valorCompra: 40000,
        costoAnterior: null,
        entroMasDespues: false,
      }).toFixed(2),
    ).toBe('3000.00');
  });

  it('nunca deja un costo en cero o negativo: si no se puede calcular, no lo toca', () => {
    expect(
      costoSinLaCompra({
        stockActual: 11,
        costoActual: 3000,
        cantidad: 10,
        valorCompra: 50000,
        costoAnterior: null,
        entroMasDespues: true,
      }).toFixed(2),
    ).toBe('3000.00');
  });

  it('un costo anterior de cero es valido y se respeta', () => {
    expect(
      costoSinLaCompra({
        stockActual: 4,
        costoActual: 5000,
        cantidad: 4,
        valorCompra: 20000,
        costoAnterior: 0,
        entroMasDespues: false,
      }).toFixed(2),
    ).toBe('0.00');
  });
});
