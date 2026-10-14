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

function createMarker(color: string) {
  const marker = document.createElement("span");
  marker.style.width = "14px";
  marker.style.height = "14px";
  marker.style.borderRadius = "999px";
  marker.style.border = "2px solid #ffffff";
  marker.style.backgroundColor = color;
  marker.style.boxShadow = "0 6px 18px rgba(15,23,42,0.25)";
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
          new maplibregl.Marker({ element: createMarker("#059669") })
            .setLngLat(pickupCoordinate)
            .addTo(map),
        );
      }
      if (dropoffCoordinate) {
        markerRef.current.push(
          new maplibregl.Marker({ element: createMarker("#0ea5e9") })
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
          paint: {
            "line-color": "#10b981",
            "line-width": 5,
            "line-opacity": 0.9,
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
