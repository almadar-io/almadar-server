import { Request, Response, NextFunction } from 'express';
/**
 * Base application error class
 */
export declare class AppError extends Error {
    statusCode: number;
    message: string;
    code?: string | undefined;
    constructor(statusCode: number, message: string, code?: string | undefined);
}
/**
 * 404 Not Found error
 */
export declare class NotFoundError extends AppError {
    constructor(message?: string);
}
/**
 * 400 Bad Request / Validation error
 */
export declare class ValidationError extends AppError {
    constructor(message?: string);
}
/**
 * 401 Unauthorized error
 */
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
/**
 * 403 Forbidden error
 */
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
/**
 * 409 Conflict error
 */
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
/**
 * Global error handler middleware
 */
export declare const errorHandler: (err: Error, _req: Request, res: Response, _next: NextFunction) => void;
/**
 * Async handler wrapper to catch errors in async route handlers
 */
export declare const asyncHandler: (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * 404 handler for unmatched routes
 */
export declare const notFoundHandler: (req: Request, res: Response) => void;
//# sourceMappingURL=errorHandler.d.ts.map