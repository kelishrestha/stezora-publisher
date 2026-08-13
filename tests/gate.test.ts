import { describe, expect, it } from 'vitest';
import { adminAssetPath, isAdminAssetRequest } from '../worker/lib/gate';

describe('isAdminAssetRequest', () => {
	it('gates admin pages except the login page', () => {
		expect(isAdminAssetRequest('/admin')).toBe(true);
		expect(isAdminAssetRequest('/admin/')).toBe(true);
		expect(isAdminAssetRequest('/admin/posts')).toBe(true);
		expect(isAdminAssetRequest('/admin/posts/123/edit')).toBe(true);
	});

	it('never gates the login page', () => {
		expect(isAdminAssetRequest('/admin/login')).toBe(false);
		expect(isAdminAssetRequest('/admin/login/')).toBe(false);
		expect(isAdminAssetRequest('/admin/login/with-any-suffix')).toBe(false);
	});

	it('does not gate non-admin paths', () => {
		expect(isAdminAssetRequest('/')).toBe(false);
		expect(isAdminAssetRequest('/about')).toBe(false);
		expect(isAdminAssetRequest('/api/content')).toBe(false);
		expect(isAdminAssetRequest('/administer')).toBe(true);
	});
});

describe('adminAssetPath', () => {
	it('maps /admin to its index asset', () => {
		expect(adminAssetPath('/admin')).toBe('/admin/index.html');
		expect(adminAssetPath('/admin/')).toBe('/admin/index.html');
	});

	it('maps admin sub-pages to their index asset', () => {
		expect(adminAssetPath('/admin/posts')).toBe('/admin/posts/index.html');
		expect(adminAssetPath('/admin/posts/')).toBe('/admin/posts/index.html');
		expect(adminAssetPath('/admin/posts/new')).toBe('/admin/posts/new/index.html');
	});
});