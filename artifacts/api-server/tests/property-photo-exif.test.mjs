import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import piexif from "piexifjs";
import {
  validateStoredPropertyPhotoExif,
} from "../src/lib/property-photo-exif.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const baseJpeg = (await readFile(resolve(testDir, "../../estatehold/public/estatehold-home-hero.jpg"))).toString("binary");
const submitted = {
  latitude: 6.474,
  longitude: 7.56,
  takenAt: new Date("2026-10-16T12:34:56.700Z"),
};

function makeJpeg({ latitude = submitted.latitude, longitude = submitted.longitude, dateTime = "2026:10:16 12:34:56", gpsDate = "2026:10:16", gpsTime = [[12, 1], [34, 1], [56, 1]] } = {}) {
  const absoluteDms = (coordinate) => {
    const absolute = Math.abs(coordinate);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60000);
    return [[degrees, 1], [minutes, 1], [seconds, 1000]];
  };
  const exif = piexif.dump({
    "0th": {},
    Exif: { 36867: dateTime },
    GPS: {
      0: [2, 3, 0, 0],
      1: latitude < 0 ? "S" : "N",
      2: absoluteDms(latitude),
      3: longitude < 0 ? "W" : "E",
      4: absoluteDms(longitude),
      7: gpsTime,
      29: gpsDate,
    },
  });
  return Buffer.from(piexif.insert(exif, baseJpeg), "binary");
}

test("accepts a JPEG whose embedded GPS and capture times match the submitted values", () => {
  assert.deepEqual(validateStoredPropertyPhotoExif(makeJpeg(), submitted), { valid: true });
});

test("rejects a JPEG without readable EXIF GPS and capture time", () => {
  const withoutExif = Buffer.from(piexif.remove(baseJpeg), "binary");
  const result = validateStoredPropertyPhotoExif(withoutExif, submitted);
  assert.equal(result.valid, false);
  assert.match(result.message, /missing readable GPS or capture-time metadata/i);
});

test("rejects a JPEG whose embedded GPS differs from the submitted location", () => {
  const result = validateStoredPropertyPhotoExif(makeJpeg(), {
    ...submitted,
    latitude: submitted.latitude + 0.001,
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /does not match the submitted details/i);
});

test("rejects a JPEG whose embedded capture time differs from the submitted time", () => {
  const result = validateStoredPropertyPhotoExif(makeJpeg(), {
    ...submitted,
    takenAt: new Date(submitted.takenAt.getTime() + 30_000),
  });
  assert.equal(result.valid, false);
  assert.match(result.message, /does not match the submitted details/i);
});

test("rejects malformed GPS time metadata", () => {
  const result = validateStoredPropertyPhotoExif(makeJpeg({ gpsDate: "not-a-date" }), submitted);
  assert.equal(result.valid, false);
  assert.match(result.message, /missing readable GPS or capture-time metadata/i);
});
