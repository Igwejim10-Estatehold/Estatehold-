import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasAdminDashboardAccess,
  hasExecutiveDashboardAccess,
  isAdminMockMode,
  isMockOwnerPreviewEnabled,
} from './dashboard-access';

describe('dashboard access policy', () => {
  it('allows admin dashboard access only for server profile admin and executive roles', () => {
    assert.equal(hasAdminDashboardAccess('admin'), true);
    assert.equal(hasAdminDashboardAccess('executive'), true);
    assert.equal(hasAdminDashboardAccess('owner'), false);
    assert.equal(hasAdminDashboardAccess('client'), false);
    assert.equal(hasAdminDashboardAccess(undefined), false);
  });

  it('allows executive dashboard access only for the server profile executive role', () => {
    assert.equal(hasExecutiveDashboardAccess('executive'), true);
    assert.equal(hasExecutiveDashboardAccess('owner'), false);
    assert.equal(hasExecutiveDashboardAccess('admin'), false);
    assert.equal(hasExecutiveDashboardAccess('client'), false);
  });

  it('enables the mock preview only in development when the explicit mock mode is enabled', () => {
    assert.equal(isAdminMockMode(true, 'true'), true);
    assert.equal(isAdminMockMode(false, 'true'), false);
    assert.equal(isAdminMockMode(true, 'false'), false);

    const preview = {
      storedEmail: ' IGWEJIM10@GMAIL.COM ',
      ownerEmail: 'igwejim10@gmail.com',
    };
    assert.equal(isMockOwnerPreviewEnabled({
      ...preview,
      development: true,
      adminMockMode: true,
    }), true);
    assert.equal(isMockOwnerPreviewEnabled({
      ...preview,
      development: false,
      adminMockMode: true,
    }), false);
    assert.equal(isMockOwnerPreviewEnabled({
      ...preview,
      development: true,
      adminMockMode: false,
    }), false);
    assert.equal(isMockOwnerPreviewEnabled({
      ...preview,
      storedEmail: 'another@example.test',
      development: true,
      adminMockMode: true,
    }), false);
  });
});
