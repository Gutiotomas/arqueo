import { decimalToString, money, quantity, sumDecimals, toDecimal } from './money';

describe('dinero', () => {
  it('no arrastra los errores del punto flotante', () => {
    // Con numeros normales 0.1 + 0.2 da 0.30000000000000004.
    expect(sumDecimals(['0.1', '0.2']).toString()).toBe('0.3');
  });

  it('redondea a dos decimales hacia arriba en el medio', () => {
    expect(money('10.005').toFixed(2)).toBe('10.01');
    expect(money('10.004').toFixed(2)).toBe('10.00');
  });

  it('aguanta importes grandes en pesos sin perder precision', () => {
    const total = sumDecimals(['1250000.55', '999999.45']);
    expect(total.toFixed(2)).toBe('2250000.00');
  });

  it('las cantidades admiten tres decimales para kilos o litros', () => {
    expect(quantity('2.5005').toString()).toBe('2.501');
    expect(quantity(3).toString()).toBe('3');
  });

  it('serializa los importes como texto con dos decimales', () => {
    expect(decimalToString(1250000)).toBe('1250000.00');
    expect(decimalToString('0')).toBe('0.00');
  });

  it('multiplica cantidad por precio sin desviarse', () => {
    const subtotal = money(quantity('3').times(toDecimal('4999.99')));
    expect(subtotal.toFixed(2)).toBe('14999.97');
  });
});
