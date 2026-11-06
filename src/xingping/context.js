import details from '../data/xingping-details.json' with { type: 'json' };
const settlementsUrl = new URL('../data/xingping-settlements.json', import.meta.url).href;
const vegetationUrl = new URL('../data/xingping-vegetation.json', import.meta.url).href;

// Kept outside model.js so the terrain worker never imports scenery chunks.
export function createXingpingContext(
  model,
  { fetchImpl = globalThis.fetch, vegetationYieldTask } = {},
) {
  const modules = [];
  let disposed = false,
    pending,
    internalController,
    removeOuterAbort;
  return {
    start({ signal } = {}) {
      if (disposed) return Promise.resolve(false);
      if (pending) return pending;
      internalController = new AbortController();
      const internalSignal = internalController.signal;
      const abortInternal = () => internalController.abort();
      signal?.addEventListener('abort', abortInternal, { once: true });
      if (signal?.aborted) abortInternal();
      removeOuterAbort = () => signal?.removeEventListener('abort', abortInternal);
      pending = (async () => {
        if (internalSignal.aborted) return false;
        const [settlementModule, vegetationModule] = await Promise.all([
          import('./settlements.js'),
          import('./vegetation.js'),
        ]);
        if (disposed || internalSignal.aborted) return false;
        if (typeof fetchImpl !== 'function') throw new Error('Xingping context requires fetch');
        const load = async (url) => {
          const response = await fetchImpl(url, { signal: internalSignal });
          if (!response?.ok) throw new Error(`Failed to load Xingping data: ${url}`);
          return response.json();
        };
        const [settlementData, vegetationData] = await Promise.all([
          load(settlementsUrl),
          load(vegetationUrl),
        ]);
        if (disposed || internalSignal.aborted) return false;
        const { toWorld, getHeight, isWater, sourceElevation, bounds, waterLevel } = model;
        const settlements = settlementModule.createXingpingSettlements({
          toWorld,
          getHeight,
          isWater,
          waterLevel,
          data: settlementData,
        });
        modules.push(settlements);
        model.group.add(settlements.group);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (disposed || internalSignal.aborted) {
          modules.splice(modules.indexOf(settlements), 1);
          model.group.remove(settlements.group);
          settlements.dispose();
          return false;
        }
        const data = settlements.group.userData.sourceData;
        const vegetation = await vegetationModule.createXingpingVegetationAsync(
          {
            toWorld,
            getHeight,
            sourceElevation,
            isWater,
            bounds,
            metadata: model.sourceData.metadata,
            woodland: vegetationData,
            buildings: data.buildings,
            roads: data.roads,
            shoals: details.shoals,
            exclusionPolygons: data.landuse
              .filter((a) => ['residential', 'farmland', 'orchard'].includes(a.landuse))
              .map((a) => a.points)
              .concat(model.jiumaCliff ? [model.jiumaCliff.footprint.outer] : []),
          },
          {
            signal: internalSignal,
            ...(vegetationYieldTask ? { yieldTask: vegetationYieldTask } : {}),
          },
        );
        if (disposed || internalSignal.aborted) {
          vegetation.dispose();
          return false;
        }
        modules.push(vegetation);
        model.group.add(vegetation.group);
        return true;
      })()
        .catch((error) => {
          if (error?.name === 'AbortError' || disposed || internalSignal.aborted) return false;
          throw error;
        })
        .finally(() => {
          removeOuterAbort?.();
          removeOuterAbort = null;
        });
      return pending;
    },
    update(camera, time) {
      let changed = false;
      for (const module of modules) changed = !!module.update(camera, time) || changed;
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      internalController?.abort();
      removeOuterAbort?.();
      removeOuterAbort = null;
      for (const module of modules) {
        model.group.remove(module.group);
        module.dispose();
      }
      modules.length = 0;
    },
  };
}
