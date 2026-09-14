import type { ReactNode } from 'react';
import { publicAsset } from '../../lib/app-base';

type TarjetaFlowBackdropProps = {
  children: ReactNode;
  variant: 'emitir' | 'exito';
};

/** Hero La Mundial a la derecha — no tapa el contenido de Pagos. */
export function TarjetaFlowBackdrop({ children, variant }: TarjetaFlowBackdropProps) {
  const heroSrc = publicAsset(
    variant === 'exito'
      ? 'branding/tarjeta-hero-exito.png'
      : 'branding/tarjeta-hero-emitir.png',
  );

  return (
    <div className="relative min-h-screen bg-[#eceff3]">
      <div
        className="pointer-events-none fixed bottom-0 right-0 z-0 hidden lg:block"
        aria-hidden
      >
        <img
          src={heroSrc}
          alt=""
          className="max-h-[min(85vh,720px)] w-auto max-w-[min(42vw,480px)] object-contain object-bottom"
          draggable={false}
        />
      </div>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
