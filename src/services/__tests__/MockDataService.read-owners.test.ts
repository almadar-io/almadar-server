/**
 * Compiled-path twin of `@almadar/runtime` `test/mock-owner-read-spread.test.ts`
 * (and `seed.rs` `read_owner_tests`): an owner column `@read` scopes by ownership
 * is owned by identities `@read` admits, so an ownership-scoped persona (an
 * employee reading only its own Employee row) gets rows. std-hr-portal: every
 * `staffAccount` went to an HR identity and employees saw nothing.
 */
import { describe, expect, it } from 'vitest';
import type { EntityRow, SExpr } from '@almadar/core';
import { MockDataService } from '../MockDataService.js';

const STAFF_FIELDS = [
  { name: 'id', type: 'string' as const, required: true },
  { name: 'name', type: 'string' as const, required: true },
  { name: 'role', type: 'string' as const, required: true, values: ['employee', 'manager', 'hr'] },
];
const EMPLOYEE_FIELDS = [
  { name: 'id', type: 'string' as const, required: true },
  { name: 'staffAccount', type: 'relation' as const, required: false, relation: { entity: 'Staff', cardinality: 'one' as const } },
];
const hrOnly: SExpr = ['=', '@user.role', 'hr'];
const ownershipRead: SExpr = ['or', ['=', '@user.role', 'hr'], ['=', '@user.role', 'manager'], ['=', ['object/get', '@entity', 'staffAccount'], '@user.id']];

function owners(readPolicy: SExpr | undefined) {
  const service = new MockDataService();
  service.registerSchema('staff', { name: 'Staff', identity: true, fields: STAFF_FIELDS });
  service.registerSchema('employees', { name: 'Employee', fields: EMPLOYEE_FIELDS, createPolicy: hrOnly, ...(readPolicy !== undefined ? { readPolicy } : {}) });
  service.seed('staff', STAFF_FIELDS, 6);
  service.seed('employees', EMPLOYEE_FIELDS, 6);
  const roleOf = new Map(service.list<EntityRow>('staff').map((s) => [s.id as string, s.role as string]));
  return service.list<EntityRow>('employees').map((e) => roleOf.get(e.staffAccount as string));
}

describe('compiled mock seed: ownership-scoped owner columns follow @read', () => {
  it('employees own rows when @read admits them by ownership', () => {
    expect(owners(ownershipRead)).toContain('employee');
  });

  it('control: without a read policy only @create-eligible HR identities own rows', () => {
    expect(new Set(owners(undefined))).toEqual(new Set(['hr']));
  });
});
