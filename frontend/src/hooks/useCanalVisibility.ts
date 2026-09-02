import { useEffect } from 'react';
import { catalogoApi } from '../lib/api';
import {
  resolveCanalEntity,
  resolveCanalMetadata,
  shouldApplyCanalRules,
  visibilityMatchesEntity,
} from '../lib/canal-visibility';
import { isBridgeChained } from '../lib/bridge-session';
import { useWizardStore } from '../store/wizardStore';
import { isRcv } from '../lib/product';
import type { CanalVisibility } from '../lib/canal-visibility';

async function waitForBridgeHydration(): Promise<void> {
  if (typeof window === 'undefined') return;
  const ready = window.__bridge?.ready;
  if (ready) {
    try {
      await ready;
    } catch {
      /* ignore */
    }
  }
}

/**
 * Carga visibilidad de canal (bridge o SSO SysIP con centidad/citem en token/store).
 * Re-fetch si cambia entidad (p. ej. canal C/1 vs gestor P/215).
 */
export function useCanalVisibility(): void {
  const metadataCanal = useWizardStore((s) => s.metadataCanal);
  const setCanalVisibility = useWizardStore((s) => s.setCanalVisibility);
  const selectedPlan = useWizardStore((s) => s.selectedPlan);

  const entity = resolveCanalEntity(metadataCanal);
  const entityKey = entity ? `${entity.centidad}/${entity.citem}` : '';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await waitForBridgeHydration();
      if (cancelled) return;

      const storeMeta = useWizardStore.getState().metadataCanal;
      const storeVisibility = useWizardStore.getState().canalVisibility;
      const currentEntity = resolveCanalEntity(storeMeta);

      if (!shouldApplyCanalRules(storeMeta)) return;
      if (!currentEntity && !isBridgeChained()) return;

      const matches = visibilityMatchesEntity(storeVisibility, currentEntity);
      if (matches && storeVisibility?.tipoEmision && storeVisibility.ui) return;

      if (!matches && storeVisibility) {
        setCanalVisibility(null);
      }

      const mergedMeta = resolveCanalMetadata(storeMeta);

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

      try {
        const res = await catalogoApi.canalVisibility({
          cproducto,
          cramo: Number.isFinite(cramo) ? cramo : undefined,
          centidad: currentEntity?.centidad,
          citem: currentEntity?.citem,
          bridge: true,
        });
        if (cancelled) return;
        if (res.data.canalVisibility) {
          setCanalVisibility(res.data.canalVisibility as CanalVisibility);
        }
      } catch (err) {
        console.warn('[canal-visibility] fetch failed', err);
      }
    };

    void load();

    const onBridgeHydrated = () => {
      void load();
    };
    window.addEventListener('bridge-hydrated', onBridgeHydrated);

    return () => {
      cancelled = true;
      window.removeEventListener('bridge-hydrated', onBridgeHydrated);
    };
  }, [
    entityKey,
    selectedPlan?.cproducto,
    setCanalVisibility,
  ]);
}
