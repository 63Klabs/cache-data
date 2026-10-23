/**
 * Consumer compilation test for the Cache.info() fields added in 1.4.0.
 * Reads tzDataVersion and saltSource from Cache.info() and assigns each to a
 * variable of its declared type, so `npm run test:types` checks both fields.
 * Compiled with `tsc --noEmit` only.
 *
 * Validates: Requirements 11.14, 12.4
 */

import cacheData = require("@63klabs/cache-data");

const info = cacheData.cache.Cache.info();

// string | null: the version of the Node.js runtime's time zone data, or null
const tzDataVersion: string | null = info.tzDataVersion;

// Exactly three values: where the cache-key salt comes from
const saltSource: "sharedCacheId" | "AWS_LAMBDA_FUNCTION_NAME" | "none" = info.saltSource;

// Fields that already existed keep their types
const timeZoneForInterval: string = info.timeZoneForInterval;
const offsetInMinutes: number = info.offsetInMinutes;
