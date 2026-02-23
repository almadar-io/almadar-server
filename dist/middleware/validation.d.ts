import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';
/**
 * Middleware to validate request body against a Zod schema
 */
export declare const validateBody: (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to validate request query parameters against a Zod schema
 */
export declare const validateQuery: (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to validate request params against a Zod schema
 */
export declare const validateParams: (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=validation.d.ts.map