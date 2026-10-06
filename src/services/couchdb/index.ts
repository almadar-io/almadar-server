/**
 * CouchDB DataService barrel; the adapter lives in `@almadar/db`.
 *
 * Host injection:
 * ```ts
 * const client = nano(process.env.COUCHDB_URL);
 * new OrbitalServerRuntime({ persistence: new CouchDBPersistence({ client }) });
 * ```
 */
export { CouchDBDataService, type CouchDBDataServiceOptions } from './couchdb-data-service.js';
