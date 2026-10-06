import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";

const KM_PER_DEGREE_LAT = 111.32;

export const DEFAULT_GRID_SIZE = 5;
export const DEFAULT_GRID_SPACING_KM = 2;
/** Not-found points count as this rank in the grid average (the Places list shows ~20). */
export const NOT_FOUND_GRID_RANK = 21;

export interface GridCell extends GeoPoint {
  row: number;
  col: number;
}

export interface GridSettings {
  size: number;
  spacingKm: number;
}

/** Odd size (centre point exists), 3..9 per side; spacing 0.5..10 km. */
export function gridSettings(experiment: { gridSize: number | null; gridSpacingKm: number | null }): GridSettings {
  const rawSize = experiment.gridSize ?? DEFAULT_GRID_SIZE;
  const odd = rawSize % 2 === 0 ? rawSize + 1 : rawSize;
  const size = Math.min(9, Math.max(3, odd));
  const spacingKm = Math.min(10, Math.max(0.5, experiment.gridSpacingKm ?? DEFAULT_GRID_SPACING_KM));
  return { size, spacingKm };
}

export function offsetPoint(centre: GeoPoint, northKm: number, eastKm: number): GeoPoint {
  const dLat = northKm / KM_PER_DEGREE_LAT;
  const dLng = eastKm / (KM_PER_DEGREE_LAT * Math.cos((centre.latitude * Math.PI) / 180));
  return {
    latitude: Number((centre.latitude + dLat).toFixed(6)),
    longitude: Number((centre.longitude + dLng).toFixed(6)),
  };
}

/** Row 0 is the northern edge, col 0 the western edge; the centre cell is the rank check location. */
export function buildGridPoints(centre: GeoPoint, { size, spacingKm }: GridSettings): GridCell[] {
  const half = (size - 1) / 2;
  const cells: GridCell[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const point = offsetPoint(centre, (half - row) * spacingKm, (col - half) * spacingKm);
      cells.push({ row, col, ...point });
    }
  }
  return cells;
}

export function isCentreCell(cell: { row: number; col: number }, size: number): boolean {
  const half = (size - 1) / 2;
  return cell.row === half && cell.col === half;
}
