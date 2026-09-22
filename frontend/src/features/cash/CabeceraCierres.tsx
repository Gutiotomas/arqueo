import { Banknote, Landmark } from 'lucide-react';

import { PageHeader } from '@/app/AppLayout';
import { PageTabs } from '@/shared/ui/page-tabs';

/** La caja (efectivo) y la cuenta (transferencias y tarjeta) se cuadran aquí. */
export function CabeceraCierres() {
  return (
    <>
      <PageHeader
        title="Caja y cuenta"
        description="Cuadra el efectivo de la caja y el saldo del banco"
      />
      <PageTabs
        label="Qué cuadrar"
        tabs={[
          { to: '/caja', label: 'Efectivo', icon: Banknote },
          { to: '/caja/cuenta', label: 'Cuenta', icon: Landmark },
        ]}
      />
    </>
  );
}
