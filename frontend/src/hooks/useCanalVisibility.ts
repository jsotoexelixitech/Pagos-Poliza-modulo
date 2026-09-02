import { useEffect } from 'react';
import { catalogoApi } from '../lib/api';
import {
  resolveCanalEntity,
  resolveCanalMetadata,
  shouldApplyCanalRules,
} from '../lib/canal-visibility';
import { isBridgeChained } from '../lib/bridge-session';
import { useWizardStore } from '../store/wizardStore';
import { isRcv } from '../lib/product';
import type { CanalVisibility } from '../lib/canal-visibility';

/**
 * Carga visibilidad de canal (bridge o SSO SysIP con centidad/citem en token/store).
 */
export function useCanalVisibility(): void {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const canalVisibility = useWizardStore((s) => s.canalVisibility);
  const setCanalVisibility = useWizardStore((s) => s.setCanalVisibility);
  const selectedPlan = useWizardStore((s) => s.selectedPlan);

  useEffect(() => {
    const mergedMeta = resolveCanalMetadata(metadataCanal);
    if (!shouldApplyCanalRules(metadataCanal)) return;

    const entity = resolveCanalEntity(metadataCanal);
    if (!entity && !isBridgeChained()) return;

    // Ya hidratada desde Emisión vía bridge
    if (canalVisibility?.tipoEmision) return;

    let cancelled = false;

    const cproducto = selectedPlan?.cproducto != null
      ? String(selectedPlan.cproducto)
      : mergedMeta?.cproducto != null
        ? String(mergedMeta.cproducto)
        : isRcv()
          ? '24'
          : undefined;

    const cramo = mergedMeta?.cramo != null
      ? parseInt(String(mergedMeta.cramo), 10)
      : undefined;

    catalogoApi
      .canalVisibility({
        cproducto,
        cramo: Number.isFinite(cramo) ? cramo : undefined,
        centidad: entity?.centidad,
        citem: entity?.citem,
        bridge: true,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.data.canalVisibility) {
          setCanalVisibility(res.data.canalVisibility as CanalVisibility);
        }
      })
      .catch(() => {
        /* fallback: sin filtro de canal */
      });

    return () => {
      cancelled = true;
    };
  }, [
    canalVisibility?.tipoEmision,
    metadataCanal,
    selectedPlan?.cproducto,
    setCanalVisibility,
  ]);
}
