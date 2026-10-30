import { Router } from '../router';
import { content } from './content';
import { collect } from './collect';
import { exportAll } from './export';
import { media } from './media';
import { postViews } from './views';
import { getLikes, postLike } from './likes';
import { requireAdmin, withBodyLimit } from '../lib/middleware';
import { adminStats } from './admin/stats';
import { analytics } from './admin/analytics';
import { audience } from './admin/audience';
import { clearAnalytics, exportAnalytics, getSettings, updateSettings } from './admin/settings';
import { integrations } from './admin/integrations';
import { neobookSync } from './admin/neobook';
import { bloggerImport, bloggerOauthCallback, bloggerOauthStart, bloggerStats } from './admin/blogger';
import { listBooks, remoteImage } from './admin/books';
import { createTestimonial, deleteTestimonial, listTestimonials, updateTestimonial } from './admin/testimonials';
import { createPost, deletePost, editorMeta, getPost, listPosts, previewPost, publishPost, updatePost } from './admin/posts';
import { createTag, deleteTag, listTags, updateTag } from './admin/tags';
import { deleteAdminMedia, listAdminMedia, localizeMedia, uploadMedia } from './admin/media';

export const routes = new Router();

routes.get('/api/content', content);
routes.get('/api/export', exportAll);
// Public pageview collection (first-party analytics beacon) and the per-post
// view count used by the on-page badge.
routes.post('/api/collect', collect);
routes.get('/api/views/:publication/:post', postViews);
// Public like button: read the count and toggle the visitor's like.
routes.get('/api/likes/:type/:id*', getLikes);
routes.post('/api/likes/:type/:id*', postLike);
// Rest parameter: localized objects live under nested keys (localized/<id>.<ext>).
routes.get('/media/:key*', media);
routes.get('/api/admin/stats', requireAdmin(adminStats));
routes.get('/api/admin/analytics', requireAdmin(analytics));
routes.get('/api/admin/audience', requireAdmin(audience));
routes.get('/api/admin/settings', requireAdmin(getSettings));
routes.get('/api/admin/integrations', requireAdmin(integrations));
routes.get('/api/admin/books', requireAdmin(listBooks));
routes.get('/api/admin/remote-image', requireAdmin(remoteImage));
routes.get('/api/admin/testimonials', requireAdmin(listTestimonials));
routes.post('/api/admin/testimonials', requireAdmin(withBodyLimit(createTestimonial)));
routes.put('/api/admin/testimonials/:id', requireAdmin(withBodyLimit(updateTestimonial)));
routes.delete('/api/admin/testimonials/:id', requireAdmin(deleteTestimonial));
routes.post('/api/admin/neobook/sync', requireAdmin(neobookSync));
routes.post('/api/admin/blogger/import', requireAdmin(withBodyLimit(bloggerImport)));
routes.post('/api/admin/blogger/stats', requireAdmin(bloggerStats));
routes.get('/api/admin/blogger/oauth/start', requireAdmin(bloggerOauthStart));
routes.get('/api/admin/blogger/oauth/callback', requireAdmin(bloggerOauthCallback));
routes.get('/api/admin/analytics/export', requireAdmin(exportAnalytics));
routes.put('/api/admin/settings', requireAdmin(withBodyLimit(updateSettings)));
routes.post('/api/admin/analytics/clear', requireAdmin(withBodyLimit(clearAnalytics)));

// Editor routes. `/api/admin/posts/meta` must be registered before
// `/api/admin/posts/:id` so the router resolves `meta` as a literal path.
routes.get('/api/admin/posts/meta', requireAdmin(editorMeta));
routes.get('/api/admin/posts', requireAdmin(listPosts));
routes.post('/api/admin/posts', requireAdmin(withBodyLimit(createPost)));
routes.post('/api/admin/posts/:id/publish', requireAdmin(publishPost));
routes.post('/api/admin/posts/:id/preview', requireAdmin(withBodyLimit(previewPost)));
routes.get('/api/admin/posts/:id', requireAdmin(getPost));
routes.put('/api/admin/posts/:id', requireAdmin(withBodyLimit(updatePost)));
routes.delete('/api/admin/posts/:id', requireAdmin(deletePost));

// Tags (per-publication, §10).
routes.get('/api/admin/tags', requireAdmin(listTags));
routes.post('/api/admin/tags', requireAdmin(withBodyLimit(createTag)));
routes.put('/api/admin/tags/:id', requireAdmin(withBodyLimit(updateTag)));
routes.delete('/api/admin/tags/:id', requireAdmin(deleteTag));

// Media manager (uploads validate server-side; §29).
routes.get('/api/admin/media', requireAdmin(listAdminMedia));
routes.post('/api/admin/media', requireAdmin(uploadMedia));
routes.delete('/api/admin/media/:id', requireAdmin(deleteAdminMedia));
routes.post('/api/admin/media/:id/localize', requireAdmin(localizeMedia));
