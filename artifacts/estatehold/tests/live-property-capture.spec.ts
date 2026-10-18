import { expect, test, type Page } from '@playwright/test';
import piexif from 'piexifjs';

const propertyId = 'gps-browser-test';
const exifCoordinates = { latitude: 6.524321, longitude: 7.512345 };
const browserCoordinates = { latitude: 6.58, longitude: 7.61 };
const openingCoordinates = { latitude: 6.41, longitude: 7.48 };

const editProperty = {
  id: propertyId,
  title: 'Browser test property',
  category: 'home',
  state: 'Enugu',
  town: 'Enugu',
  address: 'Test Street',
  priceNaira: 100000,
  intent: 'rent',
  latitude: 6.4776,
  longitude: 7.5458,
  pinStatus: 'pending',
  isExclusive: false,
  isLocked: false,
  listingModerationStatus: 'pending',
  hotelVerificationStatus: 'not_applicable',
  hotelHas24HourReception: false,
  hotelCctvCommonAreas: false,
  hotelCctvDisclosed: false,
  hotelSafetyCheckinAvailable: false,
};

const listingFlows = [
  { label: 'new listing', path: '/list-property' },
  { label: 'edited listing', path: `/property/${propertyId}/edit` },
];

type TestWindow = Window & {
  __cameraCallCount: number;
  __geoCallCount: number;
  __denyGps: boolean;
  __cameraFrameDataUrl: string;
  __releaseCamera?: () => void;
  __nativeCanvasDataUrl: (canvas: HTMLCanvasElement) => string;
};

function dms(value: number): [[number, number], [number, number], [number, number]] {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesValue);
  const secondsThousandths = Math.round((minutesValue - minutes) * 60_000);
  return [[degrees, 1], [minutes, 1], [secondsThousandths, 1000]];
}

function jpegWithGps(rawJpeg: string): string {
  const exif = piexif.dump({
    '0th': {},
    Exif: {},
    GPS: {
      0: [2, 3, 0, 0],
      1: exifCoordinates.latitude < 0 ? 'S' : 'N',
      2: dms(exifCoordinates.latitude),
      3: exifCoordinates.longitude < 0 ? 'W' : 'E',
      4: dms(exifCoordinates.longitude),
    },
  });
  return piexif.insert(exif, rawJpeg);
}

async function installCameraAndLocationMocks(page: Page, denyGps: boolean) {
  await page.addInitScript(({ deny, opening, browser }) => {
    const testWindow = window as TestWindow;
    testWindow.__cameraCallCount = 0;
    testWindow.__geoCallCount = 0;
    testWindow.__denyGps = deny;
    testWindow.__cameraFrameDataUrl = '';

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    testWindow.__nativeCanvasDataUrl = canvas => originalToDataURL.call(canvas, 'image/jpeg', 0.9);
    HTMLCanvasElement.prototype.toDataURL = function () {
      return testWindow.__cameraFrameDataUrl || originalToDataURL.call(this, 'image/jpeg', 0.9);
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === '2d') return { drawImage() {} } as CanvasRenderingContext2D;
      return originalGetContext.call(this, type as '2d', ...(args as []));
    } as typeof HTMLCanvasElement.prototype.getContext;

    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          testWindow.__cameraCallCount += 1;
          return new Promise<MediaStream>(resolve => {
            testWindow.__releaseCamera = () => resolve(new MediaStream());
          });
        },
      },
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          success: PositionCallback,
          failure?: PositionErrorCallback | null,
        ) => {
          testWindow.__geoCallCount += 1;
          queueMicrotask(() => {
            if (testWindow.__denyGps) {
              failure?.({ code: 1, message: 'Location denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
              return;
            }
            const coordinates = testWindow.__geoCallCount === 1 ? opening : browser;
            success({
              coords: {
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                accuracy: 5,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
          });
        },
      },
    });

  }, { deny: denyGps, opening: openingCoordinates, browser: browserCoordinates });

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const body = url.pathname === `/api/properties/${propertyId}` ? editProperty : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function setCameraFrame(page: Page, withExifGps: boolean) {
  const rawJpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    return (window as TestWindow).__nativeCanvasDataUrl(canvas);
  });
  const frame = withExifGps ? jpegWithGps(rawJpeg) : rawJpeg;
  await page.evaluate(dataUrl => {
    (window as TestWindow).__cameraFrameDataUrl = dataUrl;
  }, frame);
}

async function openCamera(page: Page, path: string) {
  await page.goto(path);
  if (path.includes('/edit')) {
    await expect(page.getByRole('heading', { name: 'Edit property' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Add a property' })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Take Live Photo at Location' }).click();
  await expect.poll(() => page.evaluate(() => {
    const testWindow = window as TestWindow;
    return [testWindow.__cameraCallCount, testWindow.__geoCallCount];
  })).toEqual([1, 1]);
  await page.evaluate(() => (window as TestWindow).__releaseCamera?.());
  await expect(page.getByRole('button', { name: 'Capture live photo' })).toBeVisible();
}

for (const flow of listingFlows) {
  test(`${flow.label}: requests camera and GPS together, prefers photo EXIF, and updates the location pin`, async ({ page }) => {
    await installCameraAndLocationMocks(page, false);
    await page.addInitScript(() => {
      localStorage.setItem('estatehold-session', JSON.stringify({
        access_token: 'browser-test-token',
        user: { id: 'browser-test-owner', email: 'owner@example.test' },
      }));
    });
    await openCamera(page, flow.path);
    await setCameraFrame(page, true);

    await page.getByRole('button', { name: 'Capture live photo' }).click();
    await expect.poll(() => page.evaluate(() => (window as TestWindow).__geoCallCount)).toBe(2);
    await expect(page.getByRole('status')).toContainText(
      `${exifCoordinates.latitude.toFixed(6)}, ${exifCoordinates.longitude.toFixed(6)}`,
    );
    await expect(page.getByLabel('Latitude')).toHaveValue(exifCoordinates.latitude.toFixed(6));
    await expect(page.getByLabel('Longitude')).toHaveValue(exifCoordinates.longitude.toFixed(6));
    const formCoordinates = await page.locator('input[name="latitude"], input[name="longitude"]').evaluateAll(
      inputs => inputs.map(input => Number((input as HTMLInputElement).value)),
    );
    expect(formCoordinates[0]).toBeCloseTo(exifCoordinates.latitude, 6);
    expect(formCoordinates[1]).toBeCloseTo(exifCoordinates.longitude, 6);
    await expect(page.locator('section[aria-label="Property location"] .leaflet-marker-icon')).toHaveCount(1);
    await expect(page.getByText(/Photo taken .* from listing pin/)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test(`${flow.label}: when GPS is unavailable, manual map placement works without adding a gallery upload`, async ({ page }) => {
    await installCameraAndLocationMocks(page, true);
    await page.addInitScript(() => {
      localStorage.setItem('estatehold-session', JSON.stringify({
        access_token: 'browser-test-token',
        user: { id: 'browser-test-owner', email: 'owner@example.test' },
      }));
    });
    await openCamera(page, flow.path);
    await setCameraFrame(page, false);

    await page.getByRole('button', { name: 'Capture live photo' }).click();
    await expect.poll(() => page.evaluate(() => (window as TestWindow).__geoCallCount)).toBe(2);
    await expect(page.getByRole('status')).toContainText('No location found');
    await expect(page.getByText(/Photo taken .* from listing pin/)).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    const latitude = page.getByLabel('Latitude');
    const longitude = page.getByLabel('Longitude');
    const beforeLatitude = await latitude.inputValue();
    const beforeLongitude = await longitude.inputValue();
    const map = page.locator('section[aria-label="Property location"] .leaflet-container');
    const mapBox = await map.boundingBox();
    expect(mapBox).not.toBeNull();
    await map.click({
      position: { x: mapBox!.width * 0.75, y: mapBox!.height * 0.25 },
    });
    await expect(latitude).not.toHaveValue(beforeLatitude);
    await expect(longitude).not.toHaveValue(beforeLongitude);
    await expect(page.locator('section[aria-label="Property location"] .leaflet-marker-icon')).toHaveCount(1);
  });
}
