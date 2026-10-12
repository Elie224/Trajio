/**
 * MapLibre style shared by every Trajio map surface.
 *
 * Kept in a dedicated module so the tile provider can be swapped in one place.
 * See docs/architecture.md for the OpenStreetMap tile usage policy constraints
 * that apply before going to production.
 */

import type { StyleSpecification } from "maplibre-gl";

export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© les contributeurs d'OpenStreetMap",
    },
  },
  layers: [
    {
      id: "osm-raster",
      type: "raster",
      source: "osm",
    },
  ],
};

/** Default view: greater Paris, matching the first Trajio use case. */
export const DEFAULT_VIEW = {
  longitude: 2.3522,
  latitude: 48.8566,
  zoom: 10,
} as const;
