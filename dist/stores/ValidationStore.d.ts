/**
 * ValidationStore - Firestore CRUD for validation results
 *
 * Validation results stored at: users/{uid}/apps/{appId}/validation/current
 */
import type { ValidationResults } from '@almadar/core';
export declare class ValidationStore {
    private appsCollection;
    constructor(appsCollection?: string);
    private getDocPath;
    private getAppDocPath;
    /** Save validation results */
    save(uid: string, appId: string, results: ValidationResults): Promise<void>;
    /** Get validation results */
    get(uid: string, appId: string): Promise<ValidationResults | null>;
    /** Clear validation results */
    clear(uid: string, appId: string): Promise<void>;
}
//# sourceMappingURL=ValidationStore.d.ts.map