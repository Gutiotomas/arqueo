import { costoPromedioPonderado } from './cost';

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
