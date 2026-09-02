import { useEffect } from 'react';
import { catalogoApi } from '../lib/api';
import { resolveEntityFromMetadata, shouldApplyCanalRules } from '../lib/canal-visibility';
import { useWizardStore } from '../store/wizardStore';
import { isRcv } from '../lib/product';

/**
 * Carga visibilidad de canal (bridge o SSO SysIP con centidad/citem en metadata).
 */
export function useCanalVisibility(): void {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const canalVisibility = useWizardStore((s) => s.canalVisibility);
  const setCanalVisibility = useWizardStore((s) => s.setCanalVisibility);
  const selectedPlan = useWizardStore((s) => s.selectedPlan);

  useEffect(() => {
    if (!shouldApplyCanalRules(metadataCanal)) return;
    if (canalVisibility) return;

    const entity = resolveEntityFromMetadata(metadataCanal);
    if (!entity) return;

    let cancelled = false;

    const cproducto = selectedPlan?.cproducto != null
      ? String(selectedPlan.cproducto)
      : metadataCanal?.cproducto != null
        ? String(metadataCanal.cproducto)
        : isRcv()
          ? '24'
          : undefined;

    catalogoApi
      .canalVisibility({
        cproducto,
        cramo: metadataCanal?.cramo != null
          ? parseInt(String(metadataCanal.cramo), 10)
          : undefined,
        bridge: true,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.data.canalVisibility) {
          setCanalVisibility(res.data.canalVisibility);
        }
      })
      .catch(() => {
        /* fallback: sin filtro de canal */
      });

    return () => {
      cancelled = true;
    };
  }, [
    canalVisibility,
    metadataCanal,
    selectedPlan?.cproducto,
    setCanalVisibility,
  ]);
}
