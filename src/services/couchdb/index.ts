/**
 * CouchDB persistence adapters barrel.
 *
 * Host injection (same client shared by both adapters):
 * ```ts
 * const client = nano(process.env.COUCHDB_URL);
 * new OrbitalServerRuntime({ persistence: new CouchDBPersistence({ client }) });
 * ```
 */
export { CouchDBDataService, type CouchDBDataServiceOptions } from './couchdb-data-service.js';
export { CouchDBPersistence, type CouchDBPersistenceOptions } from './couchdb-persistence.js';
export { databaseNameFor } from './rows.js';
