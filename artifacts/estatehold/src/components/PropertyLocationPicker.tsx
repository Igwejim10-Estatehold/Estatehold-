import { useEffect, useMemo, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const FALLBACK_CENTER: [number, number] = [6.4776, 7.5458];
const locationPin = divIcon({
  className: '',
  html: '<span style="display:block;width:16px;height:16px;border:3px solid white;border-radius:50%;background:#15803d;box-shadow:0 1px 6px #0007"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapView({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 14), { animate: true });
  }, [map, position?.[0], position?.[1]]);
  return null;
}

function PinDrop({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: event => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

export default function PropertyLocationPicker({
  latitude,
  longitude,
  onCoordinatesChange,
}: {
  latitude: number;
  longitude: number;
  onCoordinatesChange: (latitude: number, longitude: number) => void;
}) {
  const position = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
    ? [latitude, longitude] as [number, number]
    : null;
  const center = useMemo(() => position ?? FALLBACK_CENTER, [position?.[0], position?.[1]]);

  const pinManually = (lat: number, lng: number) => {
    onCoordinatesChange(lat, lng);
  };

  return <section className="space-y-3 sm:col-span-2" aria-label="Property location">
    <div>
      <h3 className="text-sm font-bold text-[#304039]">Property location</h3>
      <p className="mt-1 text-xs leading-5 text-[#718077]">Take a live verification photo to fill the location automatically, or click the map to place or adjust the pin. Gallery photos are not accepted as verification.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[#53665a]">Latitude
        <input readOnly value={position?.[0].toFixed(6) ?? ''} placeholder="Auto-filled from photo location" className="mt-1 block w-full rounded-lg border border-[#dfe6df] bg-[#f7f9f5] px-3 py-2 font-mono text-sm font-normal"/>
      </label>
      <label className="text-xs font-semibold text-[#53665a]">Longitude
        <input readOnly value={position?.[1].toFixed(6) ?? ''} placeholder="Auto-filled from photo location" className="mt-1 block w-full rounded-lg border border-[#dfe6df] bg-[#f7f9f5] px-3 py-2 font-mono text-sm font-normal"/>
      </label>
    </div>
    <input type="hidden" name="latitude" value={position?.[0] ?? ''}/>
    <input type="hidden" name="longitude" value={position?.[1] ?? ''}/>
    <div className="h-56 overflow-hidden rounded-xl border border-[#dfe6df]">
      <MapContainer center={center} zoom={position ? 14 : 6} scrollWheelZoom={false} className="h-full w-full" aria-label="Click to place the property map pin">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <MapView position={position}/>
        <PinDrop onPick={pinManually}/>
        {position && <Marker position={position} icon={locationPin}/>}
      </MapContainer>
    </div>
    <p className="text-[11px] text-[#718077]">Coordinates are filled from live-photo GPS when available. Otherwise, click the map to set the pin manually; typing coordinates and gallery uploads are disabled.</p>
  </section>;
}
