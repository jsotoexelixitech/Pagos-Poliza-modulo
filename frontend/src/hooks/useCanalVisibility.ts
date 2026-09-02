import { useEffect } from 'react';
import { catalogoApi } from '../lib/api';
import { resolveEntityFromMetadata } from '../lib/canal-visibility';
import { useWizardStore } from '../store/wizardStore';

/**
 * Carga visibilidad de canal si hay contexto de entidad en metadata y no vino del bridge.
 */
export function useCanalVisibility(): void {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const canalVisibility = useWizardStore((s) => s.canalVisibility);
  const setCanalVisibility = useWizardStore((s) => s.setCanalVisibility);
  const selectedPlan = useWizardStore((s) => s.selectedPlan);

  useEffect(() => {
    if (canalVisibility) return;

    const entity = resolveEntityFromMetadata(metadataCanal);
    if (!entity) return;

    let cancelled = false;

    const cproducto = selectedPlan?.cproducto != null
      ? String(selectedPlan.cproducto)
      : metadataCanal?.cproducto != null
        ? String(metadataCanal.cproducto)
        : undefined;

    catalogoApi
      .canalVisibility({
        cproducto,
        cramo: metadataCanal?.cramo != null
          ? parseInt(String(metadataCanal.cramo), 10)
          : undefined,
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
