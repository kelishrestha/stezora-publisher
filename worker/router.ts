export interface RouteContext {
	request: Request;
	env: Env;
	ctx: ExecutionContext;
	params: Record<string, string>;
}

export type RouteHandler = (context: RouteContext) => Response | Promise<Response>;

type Segment = string | { param: string; rest?: boolean };

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
	const segments = pattern
		.split('/')
		.filter(Boolean)
		.map((segment): Segment => {
			if (segment.startsWith(':')) {
				return segment.endsWith('*')
					? { param: segment.slice(1, -1), rest: true }
					: { param: segment.slice(1) };
			}
			return segment;
		});
	const restIndex = segments.findIndex((segment) => typeof segment !== 'string' && segment.rest);
	if (restIndex !== -1 && restIndex !== segments.length - 1) {
		throw new Error(`Rest parameter must be the last segment: ${pattern}`);
	}
	return segments;
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
			const lastSegment = route.segments[route.segments.length - 1];
			const hasRest = typeof lastSegment !== 'string' && lastSegment?.rest === true;
			if (hasRest ? parts.length < route.segments.length : route.segments.length !== parts.length) {
				continue;
			}
			const params: Record<string, string> = {};
			let segmentsMatch = true;
			for (let i = 0; i < route.segments.length; i += 1) {
				const segment = route.segments[i];
				if (typeof segment === 'string') {
					if (segment !== parts[i]) {
						segmentsMatch = false;
						break;
					}
				} else {
					const raw = segment.rest ? parts.slice(i) : [parts[i]];
					try {
						params[segment.param] = raw.map((part) => decodeURIComponent(part)).join('/');
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
