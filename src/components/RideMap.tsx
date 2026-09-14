import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Point } from '../domain/types';

type Props = { pickup?: Point | null; destination?: Point | null; driver?: { lat: number; lng: number } | null; geometry?: number[][]; onPick?: (point: Point) => void };
export default function RideMap({ pickup, destination, driver, geometry, onPick }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { zoomControl: false, attributionControl: true }).setView([-15.546, -55.165], 14);
    map.current = instance;
    L.tileLayer(import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18,
    }).addTo(instance);
    L.control.zoom({ position: 'topright' }).addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    instance.on('click', event => onPickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng, label: 'Ponto escolhido no mapa' }));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const group = layers.current, instance = map.current;
    if (!group || !instance) return;
    group.clearLayers();
    const points: L.LatLngExpression[] = [];
    const marker = (point: { lat: number; lng: number }, color: string, label: string) => {
      points.push([point.lat, point.lng]);
      L.circleMarker([point.lat, point.lng], { radius: 9, weight: 4, color: 'white', fillColor: color, fillOpacity: 1 }).bindTooltip(label).addTo(group);
    };
    if (pickup) marker(pickup, '#1464f4', 'Embarque');
    if (destination) marker(destination, '#13233a', 'Destino');
    if (driver) marker(driver, '#09845d', 'Motociclista');
    if (geometry?.length) L.polyline(geometry.map(coordinate => [coordinate[1], coordinate[0]] as L.LatLngTuple), { color: '#1464f4', weight: 5 }).addTo(group);
    if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [45, 45], maxZoom: 16 });
    else if (points.length === 1) instance.setView(points[0], 16);
  }, [pickup, destination, driver, geometry]);
  return <div className="map" ref={element} aria-label="Mapa de Campo Verde, com pontos de embarque e destino" />;
}
