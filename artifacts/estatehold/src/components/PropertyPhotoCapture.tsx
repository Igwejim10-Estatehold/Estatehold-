import { useEffect, useRef, useState } from 'react';
import piexif from 'piexifjs';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { divIcon } from 'leaflet';

export type LivePropertyProof = { file: File; latitude: number; longitude: number; takenAt: string; device: string };
const pinIcon = divIcon({ className: '', html: '<span style="display:block;width:14px;height:14px;border:3px solid white;border-radius:50%;background:#15803d;box-shadow:0 1px 5px #0007"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
const listingIcon = divIcon({ className: '', html: '<span style="display:block;width:14px;height:14px;border:3px solid white;border-radius:50%;background:#c08315;box-shadow:0 1px 5px #0007"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function gpsDms(value: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  let secondThousandths = Math.round((minutesFloat - minutes) * 60000);
  if (secondThousandths >= 60_000) {
    secondThousandths = 0;
    minutes += 1;
    if (minutes === 60) {
      minutes = 0;
      degrees += 1;
    }
  }
  return [[degrees, 1], [minutes, 1], [secondThousandths, 1000]];
}
function gpsTime(date: Date): [[number, number], [number, number], [number, number]] {
  return [[date.getUTCHours(), 1], [date.getUTCMinutes(), 1], [date.getUTCSeconds(), 1]];
}
function positionOnce(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
}

export default function PropertyPhotoCapture({ listingLatitude, listingLongitude, proof, onProofChange }: {
  listingLatitude: number; listingLongitude: number; proof: LivePropertyProof | null; onProofChange: (proof: LivePropertyProof | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current; }, [cameraReady]);
  useEffect(() => () => streamRef.current?.getTracks().forEach(track => track.stop()), []);
  const distance = proof && Number.isFinite(listingLatitude) && Number.isFinite(listingLongitude)
    ? distanceMeters(proof.latitude, proof.longitude, listingLatitude, listingLongitude) : null;
  const start = async () => {
    setError('');
    if (!Number.isFinite(listingLatitude) || !Number.isFinite(listingLongitude) || (listingLatitude === 0 && listingLongitude === 0)) {
      setError('Enter the property latitude and longitude before taking the live photo.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !navigator.geolocation) { setError('This browser needs camera and location permission support.'); return; }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      try { await positionOnce(); } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
      streamRef.current = stream;
      setCameraReady(true);
    } catch { setError('Allow camera and location access, then try again.'); }
    finally { setBusy(false); }
  };
  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) { setError('Camera is not ready yet.'); return; }
    setBusy(true); setError('');
    try {
      const pos = await positionOnce();
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const raw = canvas.toDataURL('image/jpeg', 0.9);
      const date = new Date();
      const stamp = date.toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
      const device = navigator.userAgent.slice(0, 200);
      const exif = piexif.dump({
        '0th': { 271: 'Estatehold live camera', 272: device },
        Exif: { 36867: stamp },
        GPS: { 0: [2, 3, 0, 0], 1: pos.coords.latitude < 0 ? 'S' : 'N', 2: gpsDms(pos.coords.latitude), 3: pos.coords.longitude < 0 ? 'W' : 'E', 4: gpsDms(pos.coords.longitude), 7: gpsTime(date), 29: date.toISOString().slice(0, 10).replaceAll('-', ':') },
      });
      const withExif = piexif.insert(exif, raw);
      const blob = await (await fetch(withExif)).blob();
      const file = new File([blob], `estatehold-live-${date.getTime()}.jpg`, { type: 'image/jpeg', lastModified: date.getTime() });
      onProofChange({ file, latitude: pos.coords.latitude, longitude: pos.coords.longitude, takenAt: date.toISOString(), device });
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; setCameraReady(false);
    } catch { setError('Could not capture the photo and GPS metadata. Check camera and location permissions.'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border border-[#dce5dd] bg-[#f7faf6] p-4 sm:col-span-2">
    <div><h3 className="font-bold">Live property verification photo</h3><p className="mt-1 text-xs leading-5 text-[#68776d]">Camera capture and GPS/time metadata provide a verification signal, not cryptographic proof; browser-provided details can be altered. No gallery upload is accepted. Location is requested only when you start capture.</p></div>
    {!cameraReady ? <button type="button" disabled={busy} onClick={start} className="min-h-11 rounded-xl bg-[#183b22] px-4 text-sm font-bold text-white">{busy ? 'Opening camera…' : 'Take Live Photo at Location'}</button> :
      <div className="space-y-3"><video ref={videoRef} autoPlay playsInline muted className="max-h-72 w-full rounded-xl bg-black object-cover"/><button type="button" disabled={busy} onClick={capture} className="min-h-11 rounded-xl bg-[#183b22] px-4 text-sm font-bold text-white">{busy ? 'Capturing…' : 'Capture live photo'}</button></div>}
    {proof && distance !== null && <div className="space-y-2">
      <p className={`text-sm font-semibold ${distance <= 100 ? 'text-green-800' : 'text-red-700'}`}>Photo taken {Math.round(distance)}m from listing pin — {distance <= 100 ? 'within 100m' : 'outside the 100m verification range'}.</p>
      <MapContainer center={[listingLatitude, listingLongitude]} zoom={15} scrollWheelZoom={false} className="h-48 w-full rounded-xl">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <Circle center={[listingLatitude, listingLongitude]} radius={100} pathOptions={{ color: '#c08315', fillOpacity: 0.08 }}/>
        <Marker position={[listingLatitude, listingLongitude]} icon={listingIcon}><Tooltip permanent>Listing pin</Tooltip></Marker>
        <Marker position={[proof.latitude, proof.longitude]} icon={pinIcon}><Tooltip permanent>Live photo</Tooltip></Marker>
        <Polyline positions={[[listingLatitude, listingLongitude], [proof.latitude, proof.longitude]]} pathOptions={{ color: distance <= 100 ? '#15803d' : '#b42318' }}/>
      </MapContainer>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
