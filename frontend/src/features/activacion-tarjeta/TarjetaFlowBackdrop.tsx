import type { ReactNode } from 'react';
import { publicAsset } from '../../lib/app-base';

type TarjetaFlowBackdropProps = {
  children: ReactNode;
  variant: 'emitir' | 'exito';
};

/** Imagen de fondo La Mundial — no altera el layout Exélixi, solo el backdrop. */
export function TarjetaFlowBackdrop({ children, variant }: TarjetaFlowBackdropProps) {
  const src = publicAsset(
    variant === 'exito'
      ? 'branding/tarjeta-fondo-exito.png'
      : 'branding/tarjeta-fondo-emitir.png',
  );

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center"
        aria-hidden
        style={{ backgroundImage: `url(${src})` }}
      />
      <div className="pointer-events-none fixed inset-0 bg-[#eceff3]/86" aria-hidden />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
