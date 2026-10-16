import piexif from "piexifjs";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_METADATA_TIME_DRIFT_MS = 2_000;
const MAX_METADATA_LOCATION_DRIFT_METERS = 10;

type ExifIfd = Record<number, unknown>;
type ExifData = { Exif?: ExifIfd; GPS?: ExifIfd };

export type SubmittedPhotoMetadata = {
  latitude: number;
  longitude: number;
  takenAt: Date;
};

export type ExifValidationResult =
  | { valid: true }
  | { valid: false; message: string };

const MISSING_METADATA_MESSAGE =
  "The uploaded JPEG is missing readable GPS or capture-time metadata. Retake the photo with camera and location access enabled.";
const INCONSISTENT_METADATA_MESSAGE =
  "The photo's embedded GPS or capture time does not match the submitted details. Retake it at the property and submit the new photo.";

function rational(value: unknown): number | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const numerator = Number(value[0]);
  const denominator = Number(value[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function degreesMinutesSeconds(value: unknown, reference: unknown, positive: string, negative: string): number | null {
  if (!Array.isArray(value) || value.length !== 3 || typeof reference !== "string") return null;
  const degrees = rational(value[0]);
  const minutes = rational(value[1]);
  const seconds = rational(value[2]);
  if (
    degrees === null || minutes === null || seconds === null ||
    degrees < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60
  ) return null;

  const direction = reference.toUpperCase();
  if (direction !== positive && direction !== negative) return null;
  const coordinate = degrees + minutes / 60 + seconds / 3600;
  return direction === negative ? -coordinate : coordinate;
}

function validUtcDate(year: number, month: number, day: number, hour: number, minute: number, second: number): number | null {
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isFinite(second) ||
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second >= 60
  ) return null;

  const millis = Date.UTC(year, month - 1, day, hour, minute, Math.floor(second));
  const date = new Date(millis);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute || date.getUTCSeconds() !== Math.floor(second)
  ) return null;
  return millis + (second - Math.floor(second)) * 1000;
}

function parseExifDateTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return validUtcDate(...match.slice(1).map(Number) as [number, number, number, number, number, number]);
}

function parseGpsDateTime(dateValue: unknown, timeValue: unknown): number | null {
  if (typeof dateValue !== "string" || !Array.isArray(timeValue) || timeValue.length !== 3) return null;
  const dateMatch = /^(\d{4}):(\d{2}):(\d{2})$/.exec(dateValue);
  if (!dateMatch) return null;
  const hour = rational(timeValue[0]);
  const minute = rational(timeValue[1]);
  const second = rational(timeValue[2]);
  if (hour === null || minute === null || second === null) return null;
  return validUtcDate(...[
    ...dateMatch.slice(1).map(Number),
    hour,
    minute,
    second,
  ] as [number, number, number, number, number, number]);
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians;
  const dLng = (lng2 - lng1) * radians;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateStoredPropertyPhotoExif(
  jpeg: Buffer,
  submitted: SubmittedPhotoMetadata,
): ExifValidationResult {
  if (jpeg.byteLength < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    return { valid: false, message: MISSING_METADATA_MESSAGE };
  }

  let exif: ExifData;
  try {
    exif = piexif.load(jpeg.toString("binary")) as ExifData;
  } catch {
    return { valid: false, message: MISSING_METADATA_MESSAGE };
  }

  const gps = exif.GPS;
  const exifIfd = exif.Exif;
  if (!gps || !exifIfd) return { valid: false, message: MISSING_METADATA_MESSAGE };

  const latitude = degreesMinutesSeconds(gps[2], gps[1], "N", "S");
  const longitude = degreesMinutesSeconds(gps[4], gps[3], "E", "W");
  const gpsTime = parseGpsDateTime(gps[29], gps[7]);
  const originalTime = parseExifDateTime(exifIfd[36867]);
  const submittedTime = submitted.takenAt.getTime();
  if (
    latitude === null || longitude === null || gpsTime === null || originalTime === null ||
    !Number.isFinite(submitted.latitude) || !Number.isFinite(submitted.longitude) ||
    !Number.isFinite(submittedTime) || Math.abs(gpsTime - originalTime) > MAX_METADATA_TIME_DRIFT_MS
  ) {
    return { valid: false, message: MISSING_METADATA_MESSAGE };
  }

  const locationDrift = distanceMeters(latitude, longitude, submitted.latitude, submitted.longitude);
  const gpsTimeDrift = Math.abs(gpsTime - submittedTime);
  const originalTimeDrift = Math.abs(originalTime - submittedTime);
  if (
    locationDrift > MAX_METADATA_LOCATION_DRIFT_METERS ||
    gpsTimeDrift > MAX_METADATA_TIME_DRIFT_MS ||
    originalTimeDrift > MAX_METADATA_TIME_DRIFT_MS
  ) {
    return { valid: false, message: INCONSISTENT_METADATA_MESSAGE };
  }
  return { valid: true };
}

export async function readBoundedPhotoBody(
  response: Response,
): Promise<Buffer | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PHOTO_BYTES) return null;

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.byteLength <= MAX_PHOTO_BYTES ? bytes : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, byteLength);
}
