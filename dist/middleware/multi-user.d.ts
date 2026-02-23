/**
 * Multi-User Middleware
 *
 * Provides user isolation and session ownership using Firebase Auth.
 *
 * @packageDocumentation
 */
import type { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                uid: string;
                email?: string;
                roles?: string[];
                orgId?: string;
            };
            userContext?: {
                userId: string;
                orgId?: string;
                roles?: string[];
            };
        }
    }
}
/**
 * Middleware to set up user context from Firebase Auth
 */
export declare function multiUserMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Verify Firebase Auth token from Authorization header
 */
export declare function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=multi-user.d.ts.map