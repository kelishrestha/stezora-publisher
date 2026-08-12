import { z } from 'zod';

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

export function isApiError(error: unknown): error is ApiError {
	return error instanceof ApiError;
}

function isZodError(error: unknown): boolean {
	if (error instanceof z.ZodError) {
		return true;
	}
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		(error as { name: unknown }).name === 'ZodError' &&
		'issues' in error &&
		Array.isArray((error as { issues: unknown }).issues)
	);
}

export function toApiError(error: unknown): ApiError {
	if (isApiError(error)) {
		return error;
	}
	if (isZodError(error)) {
		return new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.');
	}
	return new ApiError(500, 'INTERNAL_ERROR', 'Internal server error.');
}
