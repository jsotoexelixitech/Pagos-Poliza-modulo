import { useEffect, useState } from 'react';
import { BANCOS_VE, type BancoVeOption } from '../lib/bancos-ve';
import { getSypagoBanks } from '../lib/domiciliacion';

export type { BancoVeOption };

let cached: BancoVeOption[] | null = null;
let inflight: Promise<BancoVeOption[]> | null = null;

function loadSypagoBanks(): Promise<BancoVeOption[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = getSypagoBanks(true)
    .then((list) => {
      const mapped = list
        .filter((b) => b.active !== false && b.code)
        .map((b) => ({ code: String(b.code), label: b.name || String(b.code) }));
      if (mapped.length > 0) {
        cached = mapped;
        return mapped;
      }
      return BANCOS_VE;
    })
    .catch(() => BANCOS_VE)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Bancos para OTP y domiciliación: catálogo SyPago, con SUDEBAN local de respaldo.
 */
export function useBancosSypago(): BancoVeOption[] {
  const [bancos, setBancos] = useState<BancoVeOption[]>(cached ?? BANCOS_VE);

  useEffect(() => {
    let cancelado = false;
    loadSypagoBanks().then((list) => {
      if (!cancelado) setBancos(list);
    });
    return () => { cancelado = true; };
  }, []);

  return bancos;
}
