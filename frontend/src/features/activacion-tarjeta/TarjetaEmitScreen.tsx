import type { ReactNode } from 'react';
import { TarjetaLmShell } from './TarjetaLmShell';
import { TarjetaPrimaryButton } from './TarjetaPrimaryButton';

type TarjetaEmitScreenProps = {
  children: ReactNode;
  farmaciaPaid: boolean;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function TarjetaEmitScreen({
  children,
  farmaciaPaid,
  actionLabel,
  onAction,
  disabled = false,
  loading = false,
}: TarjetaEmitScreenProps) {
  return (
    <TarjetaLmShell
      title="Emitir Póliza"
      subtitle={
        farmaciaPaid
          ? 'El pago con tu factura de farmacia ya está registrado. Revisa y confirma la emisión.'
          : 'Verifica el pago y confirma la emisión de tu póliza RCV.'
      }
    >
      <div className="tarjeta-emit-content space-y-4 [&_.surface-card]:border-0 [&_.surface-card]:shadow-none [&_.surface-card]:bg-transparent">
        {children}
      </div>

      <TarjetaPrimaryButton
        className="mt-6"
        onClick={onAction}
        disabled={disabled}
        loading={loading}
      >
        {actionLabel}
      </TarjetaPrimaryButton>
    </TarjetaLmShell>
  );
}
