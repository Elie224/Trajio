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
};

/** Pin with a pulsing halo (see .map-pin in globals.css; static if reduced motion). */
function createMarker(color: string, label: string) {
  const marker = document.createElement("span");
  marker.className = "map-pin";
  marker.style.backgroundColor = color;
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", label);
  return marker;
}

export function TrajioMap({ pickup, dropoff, route, className = "" }: TrajioMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker[]>([]);

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
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyOverlay = () => {
      const pickupCoordinate = pickup ? ([pickup[0], pickup[1]] as Point) : undefined;
      const dropoffCoordinate = dropoff ? ([dropoff[0], dropoff[1]] as Point) : undefined;

      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current = [];

      if (pickupCoordinate) {
        markerRef.current.push(
          new maplibregl.Marker({ element: createMarker("#059669", "Départ") })
            .setLngLat(pickupCoordinate)
            .addTo(map),
        );
      }
      if (dropoffCoordinate) {
        markerRef.current.push(
          new maplibregl.Marker({ element: createMarker("#047857", "Arrivée") })
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
            "line-color": "#059669",
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
    };

    if (!map.isStyleLoaded()) {
      map.once("load", applyOverlay);
      return;
    }
    applyOverlay();
  }, [pickup, dropoff, route]);

  return <div ref={containerRef} className={"map-shell h-full w-full " + className} />;
}
