import { Router } from '../router';
import { content } from './content';
import { collect } from './collect';
import { exportAll } from './export';
import { media } from './media';
import { postViews } from './views';
import { requireAdmin, withBodyLimit } from '../lib/middleware';
import { adminStats } from './admin/stats';
import { analytics } from './admin/analytics';
import { audience } from './admin/audience';
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
// Rest parameter: localized objects live under nested keys (localized/<id>.<ext>).
routes.get('/media/:key*', media);
routes.get('/api/admin/stats', requireAdmin(adminStats));
routes.get('/api/admin/analytics', requireAdmin(analytics));
routes.get('/api/admin/audience', requireAdmin(audience));

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
