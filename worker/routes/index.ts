import { Router } from '../router';
import { content } from './content';
import { media } from './media';
import { requireAdmin } from '../lib/middleware';
import { adminStats } from './admin/stats';

export const routes = new Router();

routes.get('/api/content', content);
routes.get('/media/:key', media);
routes.get('/api/admin/stats', requireAdmin(adminStats));
