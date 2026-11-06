const THEMES = {
  celadon: {
    paper: '#bdcec7',
    neutral: '#a6b3ae',
    daySky: '#bdcec7',
    duskSky: '#aec4bb',
    nightSky: '#a2b9b0',
    dayFog: '#afc1ba',
    nightFog: '#2d403c',
  },
  inkstone: {
    paper: '#4a484a',
    neutral: '#3a393b',
    daySky: '#4a484a',
    duskSky: '#5a514f',
    nightSky: '#38363a',
    dayFog: '#575356',
    nightFog: '#29282b',
  },
};

export function getSceneTheme() {
  const themeName = typeof document === 'undefined' ? 'celadon' : document.documentElement.dataset.atlasTheme;
  return THEMES[themeName] || THEMES.celadon;
}

// Getters keep existing scene code compatible while allowing a theme switch
// before a scene is mounted.
const sceneColors = {};
Object.keys(THEMES.celadon).forEach((key) => {
  Object.defineProperty(sceneColors, key, { enumerable: true, get: () => getSceneTheme()[key] });
});
export const SCENE_COLORS = Object.freeze(sceneColors);

export function watchSceneTheme(scene) {
  const sync = () => {
    const { paper, dayFog } = getSceneTheme();
    scene.background.set(paper);
    scene.fog?.color.set(dayFog);
  };
  sync();
  window.addEventListener('atlas-theme-change', sync);
  return () => window.removeEventListener('atlas-theme-change', sync);
}
