import { describe, expect, it } from 'vitest';
import { adminAssetPath, isAdminAssetRequest, isAdminEditPath, isAdminViewPath } from '../worker/lib/gate';

describe('isAdminAssetRequest', () => {
	it('gates admin pages except the login page', () => {
		expect(isAdminAssetRequest('/admin')).toBe(true);
		expect(isAdminAssetRequest('/admin/')).toBe(true);
		expect(isAdminAssetRequest('/admin/posts')).toBe(true);
		expect(isAdminAssetRequest('/admin/posts/123/edit')).toBe(true);
		expect(isAdminAssetRequest('/admin/posts/123/view')).toBe(true);
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

	it('maps every post-edit path to the single static editor shell', () => {
		// The edit page is static; PostEditor reads the id from the URL client-side.
		expect(adminAssetPath('/admin/posts/123/edit')).toBe('/admin/posts/edit/index.html');
		expect(adminAssetPath('/admin/posts/foo-bar/edit')).toBe('/admin/posts/edit/index.html');
		expect(adminAssetPath('/admin/posts/123/edit/')).toBe('/admin/posts/edit/index.html');
	});

	it('maps every post-view path to the single static view shell', () => {
		// The view page is static; PostView reads the id from the URL client-side.
		expect(adminAssetPath('/admin/posts/123/view')).toBe('/admin/posts/view/index.html');
		expect(adminAssetPath('/admin/posts/foo-bar/view')).toBe('/admin/posts/view/index.html');
		expect(adminAssetPath('/admin/posts/123/view/')).toBe('/admin/posts/view/index.html');
	});
});

describe('isAdminEditPath', () => {
	it('matches post edit paths only', () => {
		expect(isAdminEditPath('/admin/posts/123/edit')).toBe(true);
		expect(isAdminEditPath('/admin/posts/new')).toBe(false);
		expect(isAdminEditPath('/admin/posts')).toBe(false);
		expect(isAdminEditPath('/admin/posts/123')).toBe(false);
		expect(isAdminEditPath('/admin/posts/123/edit/extra')).toBe(false);
	});
});

describe('isAdminViewPath', () => {
	it('matches post view paths only', () => {
		expect(isAdminViewPath('/admin/posts/123/view')).toBe(true);
		expect(isAdminViewPath('/admin/posts/new')).toBe(false);
		expect(isAdminViewPath('/admin/posts')).toBe(false);
		expect(isAdminViewPath('/admin/posts/123')).toBe(false);
		expect(isAdminViewPath('/admin/posts/123/view/extra')).toBe(false);
		expect(isAdminViewPath('/admin/posts/123/edit')).toBe(false);
	});
});