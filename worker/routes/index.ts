import { Router } from '../router';
import { content } from './content';
import { media } from './media';
import { requireAdmin, withBodyLimit } from '../lib/middleware';
import { adminStats } from './admin/stats';
import { createPost, deletePost, editorMeta, getPost, listPosts, previewPost, publishPost, updatePost } from './admin/posts';

export const routes = new Router();

routes.get('/api/content', content);
routes.get('/media/:key', media);
routes.get('/api/admin/stats', requireAdmin(adminStats));

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
