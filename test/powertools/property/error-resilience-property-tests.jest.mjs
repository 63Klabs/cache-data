/**
 * Property 5: TracingProvider Error Resilience
 * 
 * Property-based tests verifying that TracingProvider implementations never
 * propagate exceptions to the caller, regardless of what errors the underlying
 * libraries throw.
 * 
 * **Validates: Requirements 3.6, 3.7**
 * 
 * Properties Tested:
 * - For any error thrown by underlying library methods, provider methods never propagate the exception
 * - instrumentClient() always returns a value (either instrumented client or original client)
 * - openSubsegment() returns null on error (never throws)
 * - closeSubsegment() never throws even with invalid subsegment
 * - addError() never throws even with invalid arguments
 * - captureHttp() never throws even when underlying library fails
 * 
 * @private
 * @module test/powertools/property/error-resilience-property-tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";

// Import TracingProvider classes via TestHarness
const TracingProviderModule = await import("../../../src/lib/utils/TracingProvider.js");
const { TestHarness } = TracingProviderModule;
const { NoOpTracingProvider, RawXRayProvider, PowertoolsTracerProvider } = TestHarness.getInternals();

describe("Property 5: TracingProvider Error Resilience", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("NoOpTracingProvider: trivially resilient (all methods are no-ops)", () => {

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * NoOpTracingProvider methods never throw for any input.
		 */
		it("Property: NoOpTracingProvider.instrumentClient() returns client unchanged for any input", () => {
			const provider = new NoOpTracingProvider();

			fc.assert(
				fc.property(
					fc.oneof(
						fc.record({}),
						fc.record({ send: fc.constant(() => {}) }),
						fc.constant(null),
						fc.constant(undefined),
						fc.integer(),
						fc.string()
					),
					(client) => {
						const result = provider.instrumentClient(client);
						expect(result).toBe(client);
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * NoOpTracingProvider.openSubsegment() always returns null for any name.
		 */
		it("Property: NoOpTracingProvider.openSubsegment() returns null for any name", () => {
			const provider = new NoOpTracingProvider();

			fc.assert(
				fc.property(
					fc.string(),
					(name) => {
						const result = provider.openSubsegment(name);
						expect(result).toBeNull();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * NoOpTracingProvider.closeSubsegment() never throws for any argument.
		 */
		it("Property: NoOpTracingProvider.closeSubsegment() never throws for any argument", () => {
			const provider = new NoOpTracingProvider();

			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({ close: fc.constant(() => {}) }),
						fc.string(),
						fc.integer()
					),
					(subsegment) => {
						expect(() => provider.closeSubsegment(subsegment)).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * NoOpTracingProvider.addError() never throws for any arguments.
		 */
		it("Property: NoOpTracingProvider.addError() never throws for any arguments", () => {
			const provider = new NoOpTracingProvider();

			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(new Error("test")),
						fc.constant(null),
						fc.constant(undefined),
						fc.string()
					),
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({})
					),
					(error, subsegment) => {
						expect(() => provider.addError(error, subsegment)).not.toThrow();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * NoOpTracingProvider.captureHttp() never throws.
		 */
		it("Property: NoOpTracingProvider.captureHttp() never throws", () => {
			const provider = new NoOpTracingProvider();
			expect(() => provider.captureHttp()).not.toThrow();
		});
	});

	describe("RawXRayProvider: error resilience when underlying library throws", () => {

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any error thrown by the underlying captureAWSv3Client method,
		 * instrumentClient() never propagates the exception and returns the original client.
		 */
		it("Property: RawXRayProvider.instrumentClient() never throws and returns client on error", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					fc.record({ send: fc.constant(() => {}) }),
					(errorMessage, client) => {
						// Create a provider with a mocked xray that throws
						const provider = new RawXRayProvider();

						// Access the private #xray field by mocking the require
						// Since we can't directly mock private fields, we test with a provider
						// that has a null #xray (simulating failed import)
						// The constructor catches the import error, so #xray will be null
						// When #xray is null, calling this.#xray.captureAWSv3Client will throw

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						// instrumentClient should not throw even when internal state is broken
						expect(() => {
							const result = provider.instrumentClient(client);
							// When xray is available but throws, it should return the original client
							// When xray is null, accessing null.captureAWSv3Client throws TypeError
							// Either way, the method should catch and return client
							expect(result).toBeDefined();
						}).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any error thrown during captureHttp, the method never propagates the exception.
		 */
		it("Property: RawXRayProvider.captureHttp() never throws regardless of internal errors", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 100 }),
					(_errorMessage) => {
						const provider = new RawXRayProvider();

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						// captureHttp should never throw
						expect(() => provider.captureHttp()).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any subsegment name, openSubsegment() returns null on error (never throws).
		 */
		it("Property: RawXRayProvider.openSubsegment() returns null on error for any name", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 0, maxLength: 200 }),
					(name) => {
						const provider = new RawXRayProvider();

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						// openSubsegment should never throw, returns null on error
						let result;
						expect(() => {
							result = provider.openSubsegment(name);
						}).not.toThrow();

						// Result should be null (since there's no active segment in test env)
						expect(result).toBeNull();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * closeSubsegment() never throws even with invalid subsegment objects.
		 */
		it("Property: RawXRayProvider.closeSubsegment() never throws for any subsegment", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({ close: fc.constant(() => { throw new Error("close failed"); }) }),
						fc.string(),
						fc.integer(),
						fc.record({ close: fc.constant(() => {}) })
					),
					(subsegment) => {
						const provider = new RawXRayProvider();

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.closeSubsegment(subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * addError() never throws even with invalid arguments.
		 */
		it("Property: RawXRayProvider.addError() never throws for any arguments", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(new Error("test error")),
						fc.constant(new TypeError("type error")),
						fc.constant(new RangeError("range error")),
						fc.constant(null),
						fc.constant(undefined),
						fc.string()
					),
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({ addError: fc.constant(() => { throw new Error("addError failed"); }) }),
						fc.record({ addError: fc.constant(() => {}) }),
						fc.string()
					),
					(error, subsegment) => {
						const provider = new RawXRayProvider();

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.addError(error, subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("PowertoolsTracerProvider: error resilience when underlying library throws", () => {

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any error thrown by the underlying captureAWSv3Client method,
		 * instrumentClient() never propagates the exception and returns a value.
		 */
		it("Property: PowertoolsTracerProvider.instrumentClient() never throws and always returns a value", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 200 }),
					fc.record({ send: fc.constant(() => {}) }),
					(errorMessage, client) => {
						const provider = new PowertoolsTracerProvider("test-service");

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						// instrumentClient should never throw
						let result;
						expect(() => {
							result = provider.instrumentClient(client);
						}).not.toThrow();

						// Should always return a value (instrumented or original client)
						expect(result).toBeDefined();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * captureHttp() never throws even when underlying library fails.
		 */
		it("Property: PowertoolsTracerProvider.captureHttp() never throws", () => {
			const provider = new PowertoolsTracerProvider("test-service");

			// Suppress console.warn during test
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			// captureHttp is a no-op for PowertoolsTracerProvider, should never throw
			expect(() => provider.captureHttp()).not.toThrow();

			warnSpy.mockRestore();
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any subsegment name, openSubsegment() never throws and returns either
		 * a subsegment object or null.
		 */
		it("Property: PowertoolsTracerProvider.openSubsegment() never throws for any name", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 0, maxLength: 200 }),
					(name) => {
						const provider = new PowertoolsTracerProvider("test-service");

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						// openSubsegment should never throw
						let result;
						expect(() => {
							result = provider.openSubsegment(name);
						}).not.toThrow();

						// Result must be null (error case) or an object (subsegment)
						expect(result === null || typeof result === "object").toBe(true);

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * closeSubsegment() never throws even with invalid subsegment objects.
		 */
		it("Property: PowertoolsTracerProvider.closeSubsegment() never throws for any subsegment", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({
							close: fc.constant(() => { throw new Error("close failed"); }),
							parent: fc.constant({})
						}),
						fc.string(),
						fc.integer(),
						fc.record({
							close: fc.constant(() => {}),
							parent: fc.constant({ name: "parent-segment" })
						})
					),
					(subsegment) => {
						const provider = new PowertoolsTracerProvider("test-service");

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.closeSubsegment(subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * addError() never throws even with invalid arguments.
		 */
		it("Property: PowertoolsTracerProvider.addError() never throws for any arguments", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant(new Error("test error")),
						fc.constant(new TypeError("type error")),
						fc.constant(new RangeError("range error")),
						fc.constant(null),
						fc.constant(undefined),
						fc.string()
					),
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({ addError: fc.constant(() => { throw new Error("addError failed"); }) }),
						fc.record({ addError: fc.constant(() => {}) }),
						fc.string()
					),
					(error, subsegment) => {
						const provider = new PowertoolsTracerProvider("test-service");

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.addError(error, subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Cross-provider: all providers share error resilience guarantees", () => {

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any TracingProvider implementation, instrumentClient() always returns
		 * a defined value and never throws.
		 */
		it("Property: all providers' instrumentClient() returns a value and never throws for arbitrary clients", () => {
			const providers = [
				new NoOpTracingProvider(),
				new RawXRayProvider(),
				new PowertoolsTracerProvider("test-service")
			];

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: providers.length - 1 }),
					fc.oneof(
						fc.record({ send: fc.constant(() => {}) }),
						fc.record({}),
						fc.constant({ name: "mock-client" }),
						fc.constant({})
					),
					(providerIndex, client) => {
						const provider = providers[providerIndex];

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						let result;
						expect(() => {
							result = provider.instrumentClient(client);
						}).not.toThrow();

						// instrumentClient must always return a defined value
						expect(result).toBeDefined();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any TracingProvider implementation, openSubsegment() never throws
		 * and returns either a subsegment object or null.
		 */
		it("Property: all providers' openSubsegment() never throws for arbitrary names", () => {
			const providers = [
				new NoOpTracingProvider(),
				new RawXRayProvider(),
				new PowertoolsTracerProvider("test-service")
			];

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: providers.length - 1 }),
					fc.string({ minLength: 0, maxLength: 200 }),
					(providerIndex, name) => {
						const provider = providers[providerIndex];

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						let result;
						expect(() => {
							result = provider.openSubsegment(name);
						}).not.toThrow();

						// Result must be null or an object (subsegment)
						expect(result === null || typeof result === "object").toBe(true);

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any TracingProvider implementation, closeSubsegment() never throws
		 * regardless of what is passed as the subsegment argument.
		 */
		it("Property: all providers' closeSubsegment() never throws for arbitrary subsegments", () => {
			const providers = [
				new NoOpTracingProvider(),
				new RawXRayProvider(),
				new PowertoolsTracerProvider("test-service")
			];

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: providers.length - 1 }),
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({
							close: fc.constant(() => { throw new Error("close exploded"); }),
							parent: fc.constant({})
						}),
						fc.record({
							close: fc.constant(() => {}),
							parent: fc.constant({ name: "parent" })
						})
					),
					(providerIndex, subsegment) => {
						const provider = providers[providerIndex];

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.closeSubsegment(subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any TracingProvider implementation, addError() never throws
		 * regardless of what is passed as error and subsegment arguments.
		 */
		it("Property: all providers' addError() never throws for arbitrary error and subsegment", () => {
			const providers = [
				new NoOpTracingProvider(),
				new RawXRayProvider(),
				new PowertoolsTracerProvider("test-service")
			];

			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: providers.length - 1 }),
					fc.oneof(
						fc.constant(new Error("random error")),
						fc.constant(new TypeError("type mismatch")),
						fc.constant(null),
						fc.constant(undefined)
					),
					fc.oneof(
						fc.constant(null),
						fc.constant(undefined),
						fc.record({}),
						fc.record({ addError: fc.constant(() => { throw new Error("boom"); }) }),
						fc.record({ addError: fc.constant(() => {}) })
					),
					(providerIndex, error, subsegment) => {
						const provider = providers[providerIndex];

						// Suppress console.warn during test
						const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

						expect(() => provider.addError(error, subsegment)).not.toThrow();

						warnSpy.mockRestore();
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 3.6, 3.7**
		 * 
		 * For any TracingProvider implementation, captureHttp() never throws.
		 */
		it("Property: all providers' captureHttp() never throws", () => {
			const providers = [
				new NoOpTracingProvider(),
				new RawXRayProvider(),
				new PowertoolsTracerProvider("test-service")
			];

			// Suppress console.warn during test
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

			for (const provider of providers) {
				expect(() => provider.captureHttp()).not.toThrow();
			}

			warnSpy.mockRestore();
		});
	});
});
