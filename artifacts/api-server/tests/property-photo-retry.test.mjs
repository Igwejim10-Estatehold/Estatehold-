import assert from "node:assert/strict";
import { test } from "node:test";
import { canRetryPropertyPhoto } from "../src/lib/property-photo-retry.ts";

test("allows retry when no verification photo has been saved", () => {
  assert.equal(canRetryPropertyPhoto("pending", false), true);
});

test("allows rejected listings to replace rejected verification evidence", () => {
  assert.equal(canRetryPropertyPhoto("rejected", true), true);
});

test("does not replace evidence already submitted for review", () => {
  assert.equal(canRetryPropertyPhoto("pending", true), false);
});

test("never allows an approved listing's evidence to be replaced", () => {
  assert.equal(canRetryPropertyPhoto("approved", false), false);
  assert.equal(canRetryPropertyPhoto("approved", true), false);
});

test("does not allow retry for unknown moderation states", () => {
  assert.equal(canRetryPropertyPhoto(undefined, false), false);
  assert.equal(canRetryPropertyPhoto("archived", false), false);
});
