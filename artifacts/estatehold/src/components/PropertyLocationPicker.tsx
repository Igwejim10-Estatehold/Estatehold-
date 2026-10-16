import { useEffect, useMemo, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { findFirstPhotoWithGps, type ExifGps } from '@/lib/exifGps';
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
  const [gps, setGps] = useState<ExifGps | null>(null);
  const [warning, setWarning] = useState('');
  const [photoNames, setPhotoNames] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const position = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
    ? [latitude, longitude] as [number, number]
    : null;
  const center = useMemo(() => position ?? FALLBACK_CENTER, [position?.[0], position?.[1]]);

  const handlePhotos = async (files: FileList | null) => {
    const photos = Array.from(files ?? []).filter(file => file.type.startsWith('image/'));
    const replacingExifPin = gps !== null;
    setPhotoNames(photos.map(photo => photo.name));
    setGps(null);
    setWarning('');
    if (replacingExifPin) onCoordinatesChange(0, 0);
    if (!photos.length) return;

    setReading(true);
    try {
      const match = await findFirstPhotoWithGps(photos);
      if (match) {
        setGps(match.gps);
        onCoordinatesChange(match.gps.latitude, match.gps.longitude);
        setWarning('');
      } else {
        setWarning('No location found in photo — please enable Location for your camera or pin on map manually');
      }
    } finally {
      setReading(false);
    }
  };

  const pinManually = (lat: number, lng: number) => {
    setGps(null);
    onCoordinatesChange(lat, lng);
    setWarning('');
  };

  return <section className="space-y-3 sm:col-span-2" aria-label="Property location">
    <div>
      <h3 className="text-sm font-bold text-[#304039]">Property location</h3>
      <p className="mt-1 text-xs leading-5 text-[#718077]">Upload or take one or more property photos. The first photo with EXIF GPS will fill the pin location. You can also click the map to place or adjust the pin.</p>
    </div>
    <label className="block rounded-xl border border-dashed border-[#b9c9b8] bg-[#f7faf6] p-4 text-sm font-semibold text-[#304039]">
      Property photos
      <input
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={event => void handlePhotos(event.currentTarget.files)}
        className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f5e9] file:px-3 file:py-2 file:font-bold file:text-[#285b34]"
      />
      <span className="mt-2 block text-xs font-normal text-[#718077]">Photos are checked in your browser only; image upload is not performed here.</span>
    </label>
    {photoNames.length > 0 && <p className="text-xs text-[#718077]">{photoNames.length} photo{photoNames.length === 1 ? '' : 's'} selected{reading ? ' · reading GPS…' : ''}</p>}
    {warning && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{warning}</p>}
    {gps && <p role="status" className="rounded-lg bg-green-50 p-3 text-xs leading-5 text-green-900">
      GPS found in photo. {gps.accuracyMeters === null ? 'Accuracy is not recorded in this photo.' : `Reported accuracy: ±${Math.round(gps.accuracyMeters)} m.`}
    </p>}
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
    <p className="text-[11px] text-[#718077]">No coordinate typing is needed. If the photo has no GPS, click the map to set the location manually.</p>
  </section>;
}
