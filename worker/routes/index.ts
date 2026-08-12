import { Router } from '../router';
import { content } from './content';

export const routes = new Router();

routes.get('/api/content', content);
