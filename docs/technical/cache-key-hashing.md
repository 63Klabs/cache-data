# Cache Key Hashing - Technical Documentation

## Overview

Cache keys (`id_hash` values) are produced by the internal `DataHasher` class. It turns an object, array, or primitive into a reproducible, hex-encoded hash: two inputs that contain the same keys, values, types, and nesting produce the same hash, and any difference in those produces a different one.

This document is the mechanism reference for maintainers. It explains how `DataHasher` normalizes and serializes input before hashing, and it derives the non-obvious corollaries that the user-facing warnings in the cache README rest on. It is not a usage guide; for how cache keys are composed and how to avoid cross-function cache sharing, see the [cache feature README](../features/cache/README.md).

## Where this runs

`DataHasher` lives at `src/lib/utils/DataHasher.class.js`. It is internal and is not exported from the public API (`src/index.js` or `src/lib/tools/index.js`). It is reached two ways:

- `tools.hashThisData(algorithm, data, options)` - a thin wrapper that calls `DataHasher.hash` directly.
- `Cache.generateIdHash(idObject)` - clones the input, strips `connection.options`, resolves the salt, and calls `tools.hashThisData`.

```javascript
// Internal use only - import the class directly (e.g. in tests).
const DataHasher = require("../utils/DataHasher.class.js");

const hash = DataHasher.hash("sha256", { host: "example.com", path: "/api" });
```

### Algorithm

The algorithm is the first argument to `DataHasher.hash` and is passed straight to `crypto.createHash`. Through `Cache`, it resolves from the `idHashAlgorithm` init parameter, then the `CACHE_DATA_ID_HASH_ALGORITHM` environment variable, defaulting to `RSA-SHA256`:

```javascript
// Pseudo-code representation of the algorithm resolution inside Cache.init().
// Note: Private fields (#) shown for illustration - actual implementation in src/lib/dao-cache.js
// this.#idHashAlgorithm = parameters.idHashAlgorithm
//     || process.env.CACHE_DATA_ID_HASH_ALGORITHM
//     || "RSA-SHA256";
```

The algorithm choice does not change any of the normalization or serialization behavior described below. It only changes the final digest. Changing it changes every `id_hash`.

## The hashing mechanism

`DataHasher.hash` runs in three stages: normalize the input once at the top level, recursively serialize it into a single deterministic string, then digest that string (optionally salted and iterated).

### Stage 1 - normalization

For object or array input, the top-level call normalizes the structure once using `JSON.stringify` with a custom replacer, followed by `JSON.parse`:

```javascript
const normalized = JSON.parse(JSON.stringify(data, (key, value) => {
    switch (typeof value) {
        case 'bigint':
            return value.toString();
        case 'undefined':
            return 'undefined';
        default:
            return value;
    }
}));
```

Two mappings in this replacer are the source of the corollaries later in this document:

- A `bigint` is replaced with its decimal string (`42n` becomes `"42"`). `JSON.stringify` cannot serialize `bigint` and would otherwise throw.
- An `undefined` is replaced with the literal string `'undefined'`. Without this, `JSON.stringify` would drop an `undefined`-valued object key entirely, and the distinction this hash is meant to preserve would be lost.

Everything else passes through `JSON.stringify` normally. This means values that do not survive JSON serialization do not survive normalization: functions and symbols are dropped, and specialized objects such as `Date` are converted through their `.toJSON()` method. Input that is not JSON-serializable (for example, an object with circular references) throws during this step; that is a documented constraint, not a feature.

> **Note**: Normalization runs only on the top-level object or array call. During recursion an internal `skipParse` flag is set so each nested value is not re-normalized. The single top-level pass has already flattened the entire structure.

### Stage 2 - recursive serialization

After normalization, each value is serialized to a string tagged with its type. The type is derived with `typeof`, except that arrays are tagged `"array"` and `null` is tagged `"null"`:

```javascript
const dataType = (data !== null && !Array.isArray(data))
    ? typeof data
    : (Array.isArray(data)) ? "array" : "null";
```

#### Leaf values

A leaf (any non-object, non-array value) serializes to:

```text
-:::${dataType}:::${data.toString()}
```

So the number `300` serializes to `-:::number:::300`, while the string `"300"` serializes to `-:::string:::300`. The value text is identical; the `dataType` tag is not. This tag is what makes the hash value-type sensitive.

#### Objects

Object keys are sorted with `Object.keys(data).sort()` before serialization, so key order in the source object does not affect the result. Each key's value is hashed recursively, and each entry is built as `${key}:::object:::${childHash}`. The entries are joined with `|||` and prefixed with a container-type marker:

```text
object:::${sortedEntriesJoinedWith|||}
```

#### Arrays

Array elements are iterated in ascending index order and the list is **not** sorted afterward, so element position is significant. Each element is hashed recursively, and each entry is built as `${index}:::array:::${childHash}`. The entries are joined with `|||` and prefixed with the container-type marker:

```text
array:::${indexedEntriesJoinedWith|||}
```

The container-type marker is also why an empty array and an empty object hash differently: one serializes from `array:::` and the other from `object:::`, even though both have zero entries.

### Stage 3 - digest, salt, and iterations

The serialized string is hashed for the configured number of iterations. Each iteration folds in the previous digest and the salt:

```javascript
for (let i = 0; i < options.iterations; i++) {
    const hash = crypto.createHash(algorithm);
    hash.update(valueStr + hashOfData + options.salt);
    hashOfData = hash.digest('hex');
}
```

`salt` defaults to `""` and `iterations` is clamped to a minimum of `1`. A different salt or a different iteration count deterministically changes the result. `Cache.generateIdHash` supplies the salt from its two-tier salt resolution; from the mechanism's point of view the salt is just a string appended to every iteration.

## Corollaries

The following behaviors fall directly out of the mechanism above. Each was confirmed empirically against the shipped `DataHasher` (algorithm `RSA-SHA256`).

### Value-type sensitivity

Because the leaf format tags `typeof value`, the same text under two different types hashes differently. The number `300` and the string `"300"` do not collide:

```javascript
const DataHasher = require("../utils/DataHasher.class.js");

// -:::number:::300  vs  -:::string:::300
DataHasher.hash("sha256", { x: 300 }) !== DataHasher.hash("sha256", { x: "300" }); // true
```

This is the mechanism behind the README's value-type warning: a number that arrives as a string (from SSM, JSON, or a CloudFormation parameter) will not match a hard-coded number.

### `undefined`-valued key vs absent key

Because normalization maps `undefined` to the literal string `'undefined'` rather than dropping the key, an object with an `undefined`-valued key serializes with an extra entry that an object without that key does not have. The two hash differently:

```javascript
// { a: 1, b: undefined } keeps b; { a: 1 } does not
DataHasher.hash("sha256", { a: 1, b: undefined }) !== DataHasher.hash("sha256", { a: 1 }); // true
```

### `undefined` collides with the literal string `"undefined"`

This is the non-obvious corollary, and it belongs here rather than in user-facing guidance. Because the replacer rewrites `undefined` to the literal string `'undefined'` before serialization, an `undefined`-valued key is indistinguishable from the same key holding the string `"undefined"`:

```javascript
// Both normalize b to the string "undefined", so the hashes are equal.
DataHasher.hash("sha256", { a: 1, b: undefined }) === DataHasher.hash("sha256", { a: 1, b: "undefined" }); // true
```

The same mapping applies to `bigint`: because a `bigint` is replaced with its decimal string, `42n` collides with the string `"42"`:

```javascript
DataHasher.hash("sha256", { n: 42n }) === DataHasher.hash("sha256", { n: "42" }); // true
```

### Key order does not matter; array order does

Objects sort their keys before serialization, so reordering keys leaves the hash unchanged. Arrays tag each element by index and never re-sort, so reordering elements changes the hash:

```javascript
// Object keys are sorted - order-insensitive
DataHasher.hash("sha256", { a: 1, b: 2 }) === DataHasher.hash("sha256", { b: 2, a: 1 }); // true

// Array elements are index-tagged - order-significant
DataHasher.hash("sha256", [1, 2]) !== DataHasher.hash("sha256", [2, 1]); // true
```

## Related documentation

- [Cache feature README](../features/cache/README.md) - how cache keys are composed and the user-facing value-type / `undefined`-key warnings
- [In-memory cache technical documentation](./in-memory-cache.md) - the L0 cache that keys off these `id_hash` values
