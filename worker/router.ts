export interface RouteContext {
	request: Request;
	env: Env;
	ctx: ExecutionContext;
	params: Record<string, string>;
}

export type RouteHandler = (context: RouteContext) => Response | Promise<Response>;

type Segment = string | { param: string };

interface Route {
	method: string;
	segments: Segment[];
	handler: RouteHandler;
}

export type MatchResult =
	| { kind: 'match'; handler: RouteHandler; params: Record<string, string> }
	| { kind: 'method-not-allowed' }
	| { kind: 'not-found' };

function compilePattern(pattern: string): Segment[] {
	return pattern
		.split('/')
		.filter(Boolean)
		.map((segment) => (segment.startsWith(':') ? { param: segment.slice(1) } : segment));
}

function normalizePath(pathname: string): string {
	return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

/**
 * Small dependency-free router. Routes are matched in registration order.
 * Dynamic segments use the `:param` syntax.
 */
export class Router {
	private routes: Route[] = [];

	add(method: string, pattern: string, handler: RouteHandler): this {
		this.routes.push({ method, segments: compilePattern(pattern), handler });
		return this;
	}

	get(pattern: string, handler: RouteHandler): this {
		return this.add('GET', pattern, handler);
	}

	post(pattern: string, handler: RouteHandler): this {
		return this.add('POST', pattern, handler);
	}

	put(pattern: string, handler: RouteHandler): this {
		return this.add('PUT', pattern, handler);
	}

	delete(pattern: string, handler: RouteHandler): this {
		return this.add('DELETE', pattern, handler);
	}

	match(pathname: string, method: string): MatchResult {
		const parts = normalizePath(pathname).split('/').filter(Boolean);
		let pathMatched = false;

		for (const route of this.routes) {
			if (route.segments.length !== parts.length) {
				continue;
			}
			const params: Record<string, string> = {};
			let segmentsMatch = true;
			for (let i = 0; i < route.segments.length; i += 1) {
				const segment = route.segments[i];
				const part = parts[i];
				if (typeof segment === 'string') {
					if (segment !== part) {
						segmentsMatch = false;
						break;
					}
				} else {
					try {
						params[segment.param] = decodeURIComponent(part);
					} catch {
						segmentsMatch = false;
						break;
					}
				}
			}
			if (segmentsMatch) {
				pathMatched = true;
				if (route.method === method) {
					return { kind: 'match', handler: route.handler, params };
				}
			}
		}

		if (pathMatched) {
			return { kind: 'method-not-allowed' };
		}
		return { kind: 'not-found' };
	}
}
