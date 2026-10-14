import { useEffect, useRef } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export const ESTATEHOLD_HQ: [number, number] = [6.4776, 7.5458];
export const ESTATEHOLD_MAP_CENTER: [number, number] = [6.4776, 7.5458];

const hqIcon = divIcon({
  className: 'estatehold-map-icon',
  html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50% 50% 50% 0;background:#15803d;transform:rotate(-45deg);box-shadow:0 2px 8px #0006"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 20],
});

type MapsApi = {
  Map: new (element: HTMLElement, options: { center: { lat: number; lng: number }; zoom: number; mapTypeControl: boolean; streetViewControl: boolean }) => unknown;
  Marker: new (options: { position: { lat: number; lng: number }; map: unknown; title: string }) => unknown;
  InfoWindow: new (options: { content: string }) => { open: (options: { map: unknown; anchor: unknown }) => void };
};

function GoogleMap({ className }: { className: string }) {
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const maps = (window as unknown as { google?: { maps?: MapsApi } }).google?.maps;
    if (!maps || !mapElement.current) return;
    const map = new maps.Map(mapElement.current, {
      center: { lat: ESTATEHOLD_MAP_CENTER[0], lng: ESTATEHOLD_MAP_CENTER[1] },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
    });
    const marker = new maps.Marker({
      position: { lat: ESTATEHOLD_HQ[0], lng: ESTATEHOLD_HQ[1] },
      map,
      title: 'Estatehold HQ - Emene',
    });
    new maps.InfoWindow({ content: 'Estatehold HQ - Emene' }).open({ map, anchor: marker });
  }, []);

  return <div ref={mapElement} className={className} aria-label="Google map of Nigeria with Estatehold HQ marked in Emene, Enugu"/>;
}

export default function EstateholdMap({
  googleMapsKey,
  googleMapsState,
  className = '',
}: {
  googleMapsKey?: string;
  googleMapsState: 'missing' | 'loading' | 'ready' | 'failed';
  className?: string;
}) {
  const usingGoogle = Boolean(googleMapsKey) && googleMapsState === 'ready';
  const fallbackText = 'Map by OpenStreetMap - No billing required';

  return <div className={`relative h-full min-h-[380px] w-full overflow-hidden rounded-[inherit] ${className}`}>
    {usingGoogle
      ? <GoogleMap className="absolute inset-0 h-full w-full"/>
      : <MapContainer center={ESTATEHOLD_MAP_CENTER} zoom={11} scrollWheelZoom={false} className="absolute inset-0 h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={ESTATEHOLD_HQ} icon={hqIcon}>
            <Popup>Estatehold HQ - Emene</Popup>
            <Tooltip permanent direction="right" offset={[8, -8]}>Estatehold HQ - Emene</Tooltip>
          </Marker>
        </MapContainer>}
    {!usingGoogle && <span className="absolute bottom-2 left-2 z-[1000] rounded-md bg-white/95 px-2 py-1 text-[10px] font-medium text-[#405447] shadow">{fallbackText}</span>}
  </div>;
}
