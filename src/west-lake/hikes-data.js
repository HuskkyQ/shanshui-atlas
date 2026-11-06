const url = new URL('../data/west-lake-hikes.json', import.meta.url).href;
let pending;

// Both the route legend and scene use this one parsed response.
export function loadWestLakeHikes(fetcher = globalThis.fetch) {
  if (!pending)
    pending = (async () => {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`Failed to load West Lake hikes: ${response.status}`);
      return response.json();
    })().catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}
