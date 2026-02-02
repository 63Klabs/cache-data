/**
 * InMemoryCache - Ultra-fast in-memory L0 cache for AWS Lambda
 * 
 * Provides microsecond-level cache access using JavaScript Map with LRU eviction.
 * Designed for Lambda execution model with synchronous operations and no background processes.
 * @example
 * // Create cache with automatic sizing based on Lambda memory
 * const cache = new InMemoryCache();
 * 
 * // Store data with expiration
 * const data = { user: 'john', email: 'john@example.com' };
 * const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes
 * cache.set('user:123', data, expiresAt);
 * 
 * // Retrieve data
 * const result = cache.get('user:123');
 * if (result.cache === 1) {
 *   console.log('Cache hit:', result.data);
 * }
 * 
 * @example
 * // Create cache with explicit max entries
 * const cache = new InMemoryCache({ maxEntries: 10000 });
 * 
 * // Check cache info
 * const info = cache.info();
 * console.log(`Cache size: ${info.size}/${info.maxEntries}`);
 * console.log(`Memory: ${info.memoryMB}MB`);
 * 
 * @example
 * // Use with Cache.init() for in-memory caching
 * Cache.init({
 *   useInMemoryCache: true,
 *   inMemoryCacheMaxEntries: 5000
 * });
 * 
 * // Cache automatically uses InMemoryCache as L0 cache
 * const cacheInstance = new Cache(connection, profile);
 * const data = await cacheInstance.read(); // Checks in-memory first
 * 
 * @example
 * // Clear cache when needed
 * cache.clear();
 * console.log('Cache cleared');
 */

class InMemoryCache {
  #cache;
  #maxEntries;
  #memoryMB;

  /**
   * Creates a new InMemoryCache instance
   * 
   * @param {Object} options - Configuration options
   * @param {number} [options.maxEntries] - Maximum number of entries (overrides calculation)
   * @param {number} [options.entriesPerGB=5000] - Heuristic for calculating maxEntries from memory
   * @param {number} [options.defaultMaxEntries=1000] - Fallback if Lambda memory unavailable
   */
  constructor(options = {}) {
    const {
      maxEntries,
      entriesPerGB = 5000,
      defaultMaxEntries = 1000
    } = options;

    // Initialize Map storage
    this.#cache = new Map();

    // Determine MAX_ENTRIES
    if (maxEntries !== undefined && maxEntries !== null) {
      // Use explicit maxEntries parameter
      this.#maxEntries = maxEntries;
      this.#memoryMB = null;
    } else {
      // Calculate from Lambda memory allocation
      const lambdaMemory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
      
      if (lambdaMemory !== undefined && lambdaMemory !== null) {
        this.#memoryMB = parseInt(lambdaMemory, 10);
        
        if (!isNaN(this.#memoryMB) && this.#memoryMB > 0) {
          // Calculate: (memoryMB / 1024) * entriesPerGB
          this.#maxEntries = Math.floor((this.#memoryMB / 1024) * entriesPerGB);
        } else {
          // Invalid memory value, use default
          this.#maxEntries = defaultMaxEntries;
          this.#memoryMB = null;
        }
      } else {
        // Lambda memory not available, use default
        this.#maxEntries = defaultMaxEntries;
        this.#memoryMB = null;
      }
    }

    // Ensure maxEntries is at least 1
    if (this.#maxEntries < 1) {
      this.#maxEntries = 1;
    }
  }

  /**
   * Retrieves a cache entry by key
   * 
   * Returns an object containing the cache status and the cached data (if available).
   * The cache status indicates whether the lookup was a hit (1), miss (0), or expired (-1).
   * For cache hits, the data property contains the stored CacheDataFormat object. For misses, data is null.
   * For expired entries, data contains the expired CacheDataFormat object before it's removed from cache.
   * 
   * @param {string} key - Cache key to look up
   * @returns {{cache: number, data: Object|null}} Lookup result with cache status and data
   * @returns {number} return.cache - Cache status: 1 (hit), 0 (miss), or -1 (expired)
   * @returns {Object|null} return.data - The cached CacheDataFormat object on hit/expired, or null on miss
   * 
   * @example
   * // Cache hit
   * cache.get('myKey') 
   * // => { cache: 1, data: { cache: { body: '...', headers: {...}, expires: 1234567890, statusCode: '200' } } }
   * 
   * @example
   * // Cache miss
   * cache.get('nonExistent') // => { cache: 0, data: null }
   * 
   * @example
   * // Expired entry
   * cache.get('expiredKey') 
   * // => { cache: -1, data: { cache: { body: '...', headers: {...}, expires: 1234567890, statusCode: '200' } } }
   */
  get(key) {
    // Check if key exists
    if (!this.#cache.has(key)) {
      return { cache: 0, data: null };
    }

    const entry = this.#cache.get(key);
    const now = Date.now();

    // Check if expired
    if (entry.expiresAt <= now) {
      // Delete expired entry
      this.#cache.delete(key);
      return { cache: -1, data: entry.value };
    }

    // Valid entry - update LRU position by deleting and re-setting
    this.#cache.delete(key);
    this.#cache.set(key, entry);

    return { cache: 1, data: entry.value };
  }

  /**
   * Stores a cache entry with expiration
   * 
   * Adds or updates a cache entry with the specified key, value, and expiration time.
   * If the key already exists, it will be updated and moved to the most recent position (LRU).
   * If the cache is at maximum capacity, the least recently used entry will be evicted automatically.
   * The expiresAt timestamp should be in milliseconds since epoch (e.g., Date.now() + ttl).
   * 
   * @param {string} key - Cache key to store the value under
   * @param {Object} value - CacheDataFormat object or any data structure to cache
   * @param {number} expiresAt - Expiration timestamp in milliseconds since epoch (e.g., Date.now() + 60000 for 1 minute)
   * @returns {void}
   * 
   * @example
   * // Store a cache entry that expires in 5 minutes
   * const fiveMinutes = 5 * 60 * 1000;
   * cache.set('myKey', { cache: { body: 'response data', headers: {}, expires: Date.now() + fiveMinutes, statusCode: '200' } }, Date.now() + fiveMinutes);
   * 
   * @example
   * // Store with a specific expiration timestamp
   * const expirationTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
   * cache.set('sessionData', { userId: 123, token: 'abc' }, expirationTime);
   * 
   * @example
   * // Update an existing entry (moves to most recent position)
   * cache.set('existingKey', { updated: 'data' }, Date.now() + 300000);
   */
  set(key, value, expiresAt) {
    // If key exists, delete it first for LRU repositioning
    if (this.#cache.has(key)) {
      this.#cache.delete(key);
    }

    // Check capacity and evict if necessary
    if (this.#cache.size >= this.#maxEntries) {
      // Get first (oldest) entry
      const oldestKey = this.#cache.keys().next().value;
      this.#cache.delete(oldestKey);
    }

    // Store new entry
    this.#cache.set(key, { value, expiresAt });
  }

  /**
   * Clears all entries from the cache
   */
  clear() {
    this.#cache.clear();
  }

  /**
   * Returns information about the cache state
   * 
   * @returns {Object} Cache information
   * @returns {number} return.size - Current number of entries
   * @returns {number} return.maxEntries - Maximum capacity
   * @returns {number|null} return.memoryMB - Lambda memory allocation (if available)
   */
  info() {
    return {
      size: this.#cache.size,
      maxEntries: this.#maxEntries,
      memoryMB: this.#memoryMB
    };
  }
}

module.exports = InMemoryCache;
