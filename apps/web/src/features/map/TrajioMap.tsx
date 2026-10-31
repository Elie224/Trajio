"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { DEFAULT_VIEW, OSM_RASTER_STYLE } from "@/lib/map";

type Coordinate = readonly [number, number];
type Point = [number, number];

type TrajioMapProps = {
  pickup?: Coordinate;
  dropoff?: Coordinate;
  route?: Coordinate[];
  className?: string;
  /** When set, a click on the map reports WGS84 [lng, lat]. */
  onMapClick?: (lngLat: [number, number]) => void;
};

/** Pin with a pulsing halo (see .map-pin in globals.css; static if reduced motion). */
function createMarker(variant: "pickup" | "dropoff", label: string) {
  const marker = document.createElement("span");
  marker.className = `map-pin map-pin--${variant}`;
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", label);
  return marker;
}

/** Paints markers, the route line and the camera position on the given map. */
function paintOverlay(
  map: maplibregl.Map,
  markers: maplibregl.Marker[],
  pickup?: Coordinate,
  dropoff?: Coordinate,
  route?: Coordinate[],
) {
  const pickupCoordinate = pickup ? ([pickup[0], pickup[1]] as Point) : undefined;
  const dropoffCoordinate = dropoff ? ([dropoff[0], dropoff[1]] as Point) : undefined;

  markers.forEach((marker) => marker.remove());
  markers.length = 0;

  if (pickupCoordinate) {
    markers.push(
      new maplibregl.Marker({ element: createMarker("pickup", "Départ") })
        .setLngLat(pickupCoordinate)
        .addTo(map),
    );
  }
  if (dropoffCoordinate) {
    markers.push(
      new maplibregl.Marker({ element: createMarker("dropoff", "Arrivée") })
        .setLngLat(dropoffCoordinate)
        .addTo(map),
    );
  }

  const sourceId = "selected-route";
  const layerId = "selected-route-layer";
  const routeCoordinates = (route ?? []).map(([lng, lat]) => [lng, lat] as Point);

  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routeCoordinates,
        },
      },
    });
  }

  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
  source.setData({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: routeCoordinates,
    },
  });

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": getComputedStyle(map.getContainer()).getPropertyValue("--color-primary-strong").trim(),
        "line-width": 5,
        "line-opacity": 0.95,
      },
    });
  }

  const pointCoordinates = [pickupCoordinate, dropoffCoordinate].filter(
    (coordinate): coordinate is Point => Boolean(coordinate),
  );
  const boundsInput = routeCoordinates.length > 1 ? routeCoordinates : pointCoordinates;
  if (boundsInput.length > 1) {
    const bounds = new LngLatBounds(boundsInput[0], boundsInput[0]);
    boundsInput.slice(1).forEach((coordinate) => bounds.extend(coordinate));
    map.fitBounds(bounds, { padding: 50, maxZoom: 13, duration: 700 });
  } else if (pickupCoordinate) {
    map.easeTo({ center: pickupCoordinate, zoom: 12, duration: 600 });
  }
}

export function TrajioMap({ pickup, dropoff, route, className = "", onMapClick }: TrajioMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker[]>([]);
  const onMapClickRef = useRef(onMapClick);
  const overlayRef = useRef<{ pickup?: Coordinate; dropoff?: Coordinate; route?: Coordinate[] }>({});

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    overlayRef.current = { pickup, dropoff, route };
  }, [pickup, dropoff, route]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl(
      new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center: [DEFAULT_VIEW.longitude, DEFAULT_VIEW.latitude],
      zoom: DEFAULT_VIEW.zoom,
      cooperativeGestures: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      onMapClickRef.current?.([
        Number(event.lngLat.lng.toFixed(6)),
        Number(event.lngLat.lat.toFixed(6)),
      ]);
    };
    map.on("click", handleClick);
    mapRef.current = map;
    // Paint the initial overlay as soon as the style is ready.
    map.once("load", () => {
      const { pickup, dropoff, route } = overlayRef.current;
      paintOverlay(map, markerRef.current, pickup, dropoff, route);
    });

    return () => {
      map.off("click", handleClick);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        paintOverlay(map, markerRef.current, pickup, dropoff, route);
      });
      return;
    }
    paintOverlay(map, markerRef.current, pickup, dropoff, route);
  }, [pickup, dropoff, route]);

  const shellClass = "map-shell h-full w-full " + (onMapClick ? "cursor-crosshair " : "") + className;

  return <div ref={containerRef} className={shellClass} />;
}
