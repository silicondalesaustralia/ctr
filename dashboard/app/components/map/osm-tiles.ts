export const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Map window in world pixels at `zoom`: origin is the top-left corner. */
export interface MapView {
  zoom: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface Tile {
  key: string;
  url: string;
  x: number;
  y: number;
}

/** Web Mercator world pixel coordinates (the projection OSM tiles use). */
export function project(point: LatLng, zoom: number): ScreenPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, point.latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function bounds(points: LatLng[], zoom: number) {
  const projected = points.map((point) => project(point, zoom));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Highest zoom where every point fits inside the window with padding. */
export function computeView(points: LatLng[], width: number, height: number, padding: number, maxZoom: number): MapView {
  const fit = points.length > 0 ? points : [{ latitude: 0, longitude: 0 }];
  let zoom = maxZoom;
  for (; zoom > 1; zoom -= 1) {
    const box = bounds(fit, zoom);
    if (box.maxX - box.minX <= width - 2 * padding && box.maxY - box.minY <= height - 2 * padding) break;
  }
  const box = bounds(fit, zoom);
  return {
    zoom,
    originX: (box.minX + box.maxX) / 2 - width / 2,
    originY: (box.minY + box.maxY) / 2 - height / 2,
    width,
    height,
  };
}

export function toScreen(view: MapView, point: LatLng): ScreenPoint {
  const world = project(point, view.zoom);
  return { x: world.x - view.originX, y: world.y - view.originY };
}

/** Tiles covering the window, positioned in window pixels. */
export function visibleTiles(view: MapView): Tile[] {
  const count = 2 ** view.zoom;
  const firstX = Math.floor(view.originX / TILE_SIZE);
  const lastX = Math.floor((view.originX + view.width) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(view.originY / TILE_SIZE));
  const lastY = Math.min(count - 1, Math.floor((view.originY + view.height) / TILE_SIZE));
  const tiles: Tile[] = [];
  for (let ty = firstY; ty <= lastY; ty += 1) {
    for (let tx = firstX; tx <= lastX; tx += 1) {
      const wrapped = ((tx % count) + count) % count;
      tiles.push({
        key: `${view.zoom}-${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${view.zoom}/${wrapped}/${ty}.png`,
        x: tx * TILE_SIZE - view.originX,
        y: ty * TILE_SIZE - view.originY,
      });
    }
  }
  return tiles;
}

/** Window pixels per kilometre at a latitude (for sizing grid squares). */
export function pixelsPerKm(view: MapView, latitude: number): number {
  const metresPerPixel = (40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) / (TILE_SIZE * 2 ** view.zoom);
  return 1000 / metresPerPixel;
}
