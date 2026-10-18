import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanupUnreferencedPropertyPhoto } from "../src/lib/property-photo-cleanup.ts";

test("does not remove a photo object already referenced by a record", async () => {
  let removeCalled = false;
  const result = await cleanupUnreferencedPropertyPhoto(
    async () => true,
    async () => {
      removeCalled = true;
    },
  );

  assert.equal(result, "already-referenced");
  assert.equal(removeCalled, false);
});

test("removes a rejected photo only when no record references it", async () => {
  let removeCalled = false;
  const result = await cleanupUnreferencedPropertyPhoto(
    async () => false,
    async () => {
      removeCalled = true;
    },
  );

  assert.equal(result, "removed");
  assert.equal(removeCalled, true);
});

test("does not remove a photo when the reference check fails", async () => {
  let removeCalled = false;
  const result = await cleanupUnreferencedPropertyPhoto(
    async () => {
      throw new Error("database unavailable");
    },
    async () => {
      removeCalled = true;
    },
  );

  assert.equal(result, "failed");
  assert.equal(removeCalled, false);
});

test("reports cleanup failures without throwing into verification handling", async () => {
  const result = await cleanupUnreferencedPropertyPhoto(
    async () => false,
    async () => {
      throw new Error("storage unavailable");
    },
  );

  assert.equal(result, "failed");
});
