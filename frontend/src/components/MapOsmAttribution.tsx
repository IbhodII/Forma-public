import { useEffect } from "react";
import { useMap } from "react-leaflet";

/** Текст атрибуции для тайлов OpenStreetMap (обязательно по лицензии ODbL). */
export const OSM_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a>';

/** Убирает префикс «Leaflet» в углу карты; флаг не является требованием OSM. */
export function MapAttributionSetup() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(false);
  }, [map]);
  return null;
}
