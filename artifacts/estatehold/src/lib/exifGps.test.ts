import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findFirstPhotoWithGps, normalizeExifGps, parseExifGps } from './exifGps';

describe('EXIF GPS parsing helpers', () => {
  it('accepts valid coordinates and reported horizontal accuracy', () => {
    assert.deepEqual(normalizeExifGps({ latitude: 6.48, longitude: 7.55 }, 8.4), {
      latitude: 6.48,
      longitude: 7.55,
      accuracyMeters: 8.4,
    });
  });

  it('rejects missing, non-finite, and out-of-range coordinates', () => {
    assert.equal(normalizeExifGps(null), null);
    assert.equal(normalizeExifGps({ latitude: Number.NaN, longitude: 7 }), null);
    assert.equal(normalizeExifGps({ latitude: 91, longitude: 7 }), null);
    assert.equal(normalizeExifGps({ latitude: 6, longitude: 181 }), null);
  });

  it('uses the first photo in selection order that contains GPS', async () => {
    const photos = [new Blob(['one']), new Blob(['two']), new Blob(['three'])];
    const result = await findFirstPhotoWithGps(photos, async photo => {
      return photo === photos[1] ? { latitude: 6.5, longitude: 7.5, accuracyMeters: null } : null;
    });

    assert.deepEqual(result, {
      photo: photos[1],
      index: 1,
      gps: { latitude: 6.5, longitude: 7.5, accuracyMeters: null },
    });
  });

  it('returns no GPS for image data without readable EXIF', async () => {
    assert.equal(await parseExifGps(new Blob(['not an image'])), null);
  });
});
