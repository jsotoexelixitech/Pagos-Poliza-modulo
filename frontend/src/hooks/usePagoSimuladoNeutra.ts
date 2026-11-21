import { useEffect, useState } from 'react';
import {
  consultarPagoSimuladoNeutra,
  puedeConsultarPagoSimuladoNeutra,
} from '../lib/pago-simulado-neutra';

/**
 * `true` solo cuando marca neutra + host de prueba + server de Pagos lo confirma.
 * Mientras no hay confirmación (o en producción) devuelve `false` → pago real.
 */
export function usePagoSimuladoNeutra(): boolean {
  const [permitido, setPermitido] = useState(false);

  useEffect(() => {
    if (!puedeConsultarPagoSimuladoNeutra()) return;
    let activo = true;
    void consultarPagoSimuladoNeutra().then((ok) => {
      if (activo) setPermitido(ok);
    });
    return () => {
      activo = false;
    };
  }, []);

  return permitido;
}
