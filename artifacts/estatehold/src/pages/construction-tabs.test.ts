import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { constructionTabUrl, getConstructionTab } from './construction-tabs';

describe('construction tab navigation', () => {
  it('reads valid deep links and falls back for unknown tabs', () => {
    assert.equal(getConstructionTab('?tab=ongoing'), 'ongoing');
    assert.equal(getConstructionTab('?tab=invalid'), 'plans');
  });
  it('keeps the construction route and encodes the selected tab', () => {
    assert.equal(constructionTabUrl('completed'), '/construction?tab=completed');
  });
});
