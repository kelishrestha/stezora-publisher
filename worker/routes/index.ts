import { Router } from '../router';
import { content } from './content';
import { media } from './media';

export const routes = new Router();

routes.get('/api/content', content);
routes.get('/media/:key', media);
