import * as exifr from 'exifr';

export type ExifGps = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export function chooseCaptureGps(
  exifGps: { latitude: number; longitude: number } | null | undefined,
  capturePosition: { latitude: number; longitude: number } | null | undefined,
  openingPosition: { latitude: number; longitude: number } | null | undefined,
): { latitude: number; longitude: number } | null {
  return exifGps ?? capturePosition ?? openingPosition ?? null;
}

export function normalizeExifGps(
  coordinates: { latitude?: unknown; longitude?: unknown } | null | undefined,
  accuracy?: unknown,
): ExifGps | null {
  const latitude = Number(coordinates?.latitude);
  const longitude = Number(coordinates?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const accuracyMeters = Number(accuracy);
  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) && accuracyMeters >= 0 ? accuracyMeters : null,
  };
}

export async function parseExifGps(file: Blob): Promise<ExifGps | null> {
  try {
    const [coordinates, tags] = await Promise.all([
      exifr.gps(file),
      exifr.parse(file, ['GPSHPositioningError']),
    ]);
    return normalizeExifGps(
      coordinates as { latitude?: unknown; longitude?: unknown } | null,
      (tags as { GPSHPositioningError?: unknown } | null)?.GPSHPositioningError,
    );
  } catch {
    return null;
  }
}

export async function findFirstPhotoWithGps<T extends Blob>(
  photos: readonly T[],
  parse: (photo: T) => Promise<ExifGps | null> = parseExifGps,
): Promise<{ photo: T; index: number; gps: ExifGps } | null> {
  for (const [index, photo] of photos.entries()) {
    const gps = await parse(photo);
    if (gps) return { photo, index, gps };
  }
  return null;
}
