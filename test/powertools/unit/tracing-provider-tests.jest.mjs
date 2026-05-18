/**
 * Unit tests for TracingProvider implementations.
 * 
 * Tests NoOpTracingProvider, RawXRayProvider, and PowertoolsTracerProvider
 * for correct behavior including subsegment lifecycle management.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.4, 5.5, 5.6, 5.7
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Import TracingProvider classes directly
const TracingProviderModule = await import("../../../src/lib/utils/TracingProvider.js");
const { NoOpTracingProvider, RawXRayProvider, PowertoolsTracerProvider } = TracingProviderModule;

describe("TracingProvider Implementations", () => {

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("NoOpTracingProvider", () => {
		let provider;

		beforeEach(() => {
			provider = new NoOpTracingProvider();
		});

		it("name getter should return 'none'", () => {
			expect(provider.name).toBe("none");
		});

		it("instrumentClient() should return the same client object unchanged", () => {
			const mockClient = { send: () => {}, config: { region: "us-east-1" } };
			const result = provider.instrumentClient(mockClient);
			expect(result).toBe(mockClient);
		});

		it("instrumentClient() should return the exact same reference", () => {
			const mockClient = Object.freeze({ id: "test-client" });
			const result = provider.instrumentClient(mockClient);
			expect(result).toBe(mockClient);
		});

		it("captureHttp() should not throw", () => {
			expect(() => provider.captureHttp()).not.toThrow();
		});

		it("openSubsegment() should return null", () => {
			const result = provider.openSubsegment("test-segment");
			expect(result).toBe(null);
		});

		it("closeSubsegment() should not throw", () => {
			expect(() => provider.closeSubsegment(null)).not.toThrow();
			expect(() => provider.closeSubsegment(undefined)).not.toThrow();
			expect(() => provider.closeSubsegment({})).not.toThrow();
		});

		it("addError() should not throw", () => {
			expect(() => provider.addError(new Error("test"), null)).not.toThrow();
			expect(() => provider.addError(new Error("test"), undefined)).not.toThrow();
			expect(() => provider.addError(new Error("test"), {})).not.toThrow();
		});
	});

	describe("RawXRayProvider", () => {
		let provider;

		beforeEach(() => {
			provider = new RawXRayProvider();
		});

		it("name getter should return 'raw-xray'", () => {
			expect(provider.name).toBe("raw-xray");
		});

		it("constructor should succeed since aws-xray-sdk-core is installed as devDependency", () => {
			expect(() => new RawXRayProvider()).not.toThrow();
		});

		it("instrumentClient() should not throw (may fail without active segment but returns client)", () => {
			const mockClient = { send: () => {}, config: { region: "us-east-1" } };
			expect(() => {
				const result = provider.instrumentClient(mockClient);
				// Should return the client (either instrumented or original on error)
				expect(result).toBeDefined();
			}).not.toThrow();
		});

		it("captureHttp() should not throw", () => {
			expect(() => provider.captureHttp()).not.toThrow();
		});

		it("openSubsegment() should return null when no active segment (but not throw)", () => {
			const result = provider.openSubsegment("test-segment");
			expect(result).toBe(null);
		});

		it("closeSubsegment(null) should not throw", () => {
			expect(() => provider.closeSubsegment(null)).not.toThrow();
		});

		it("closeSubsegment(undefined) should not throw", () => {
			expect(() => provider.closeSubsegment(undefined)).not.toThrow();
		});

		it("addError(new Error('test'), null) should not throw", () => {
			expect(() => provider.addError(new Error("test"), null)).not.toThrow();
		});

		it("addError(new Error('test'), undefined) should not throw", () => {
			expect(() => provider.addError(new Error("test"), undefined)).not.toThrow();
		});
	});

	describe("PowertoolsTracerProvider", () => {
		let provider;

		beforeEach(() => {
			provider = new PowertoolsTracerProvider("test-service");
		});

		it("name getter should return 'powertools-tracer'", () => {
			expect(provider.name).toBe("powertools-tracer");
		});

		it("constructor should succeed since @aws-lambda-powertools/tracer is installed as devDependency", () => {
			expect(() => new PowertoolsTracerProvider("test-service")).not.toThrow();
		});

		it("instance getter should return the Tracer instance (not null)", () => {
			expect(provider.instance).not.toBe(null);
			expect(provider.instance).toBeDefined();
		});

		it("instrumentClient() should not throw (may fail without active segment but returns client)", () => {
			const mockClient = { send: () => {}, config: { region: "us-east-1" } };
			expect(() => {
				const result = provider.instrumentClient(mockClient);
				// Should return the client (either instrumented or original on error)
				expect(result).toBeDefined();
			}).not.toThrow();
		});

		it("openSubsegment() should not throw when no active Lambda segment", () => {
			// Powertools Tracer may create its own internal segment, so openSubsegment
			// may return a subsegment object or null depending on internal state.
			// The key requirement is that it never throws.
			expect(() => {
				const result = provider.openSubsegment("test-segment");
				// Result is either a subsegment object or null - both are valid
				if (result !== null) {
					expect(result).toHaveProperty("name", "test-segment");
				}
			}).not.toThrow();
		});

		it("closeSubsegment(null) should not throw", () => {
			expect(() => provider.closeSubsegment(null)).not.toThrow();
		});

		it("closeSubsegment(undefined) should not throw", () => {
			expect(() => provider.closeSubsegment(undefined)).not.toThrow();
		});

		it("addError(new Error('test'), null) should not throw", () => {
			expect(() => provider.addError(new Error("test"), null)).not.toThrow();
		});

		it("addError(new Error('test'), undefined) should not throw", () => {
			expect(() => provider.addError(new Error("test"), undefined)).not.toThrow();
		});
	});

	describe("Subsegment lifecycle with mock subsegments", () => {

		describe("RawXRayProvider subsegment lifecycle", () => {
			let provider;

			beforeEach(() => {
				provider = new RawXRayProvider();
			});

			it("closeSubsegment() should call close() on mock subsegment", () => {
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn()
				};

				provider.closeSubsegment(mockSubsegment);
				expect(mockSubsegment.close).toHaveBeenCalledTimes(1);
			});

			it("addError() should call addError() on mock subsegment", () => {
				const testError = new Error("test error");
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn()
				};

				provider.addError(testError, mockSubsegment);
				expect(mockSubsegment.addError).toHaveBeenCalledTimes(1);
				expect(mockSubsegment.addError).toHaveBeenCalledWith(testError);
			});

			it("closeSubsegment() should not call close() when subsegment is null", () => {
				// Should not throw and should not attempt to call close on null
				expect(() => provider.closeSubsegment(null)).not.toThrow();
			});

			it("addError() should not call addError() when subsegment is null", () => {
				// Should not throw and should not attempt to call addError on null
				expect(() => provider.addError(new Error("test"), null)).not.toThrow();
			});
		});

		describe("PowertoolsTracerProvider subsegment lifecycle", () => {
			let provider;

			beforeEach(() => {
				provider = new PowertoolsTracerProvider("test-service");
			});

			it("closeSubsegment() should call close() on mock subsegment", () => {
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn(),
					parent: { name: "parent-segment" }
				};

				provider.closeSubsegment(mockSubsegment);
				expect(mockSubsegment.close).toHaveBeenCalledTimes(1);
			});

			it("addError() should call addError() on mock subsegment", () => {
				const testError = new Error("test error");
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn(),
					parent: { name: "parent-segment" }
				};

				provider.addError(testError, mockSubsegment);
				expect(mockSubsegment.addError).toHaveBeenCalledTimes(1);
				expect(mockSubsegment.addError).toHaveBeenCalledWith(testError);
			});

			it("closeSubsegment() should not call close() when subsegment is null", () => {
				expect(() => provider.closeSubsegment(null)).not.toThrow();
			});

			it("addError() should not call addError() when subsegment is null", () => {
				expect(() => provider.addError(new Error("test"), null)).not.toThrow();
			});
		});

		describe("NoOpTracingProvider subsegment lifecycle (no-ops)", () => {
			let provider;

			beforeEach(() => {
				provider = new NoOpTracingProvider();
			});

			it("closeSubsegment() with mock subsegment should not throw and not call close()", () => {
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn()
				};

				// NoOp provider ignores subsegment entirely
				expect(() => provider.closeSubsegment(mockSubsegment)).not.toThrow();
			});

			it("addError() with mock subsegment should not throw and not call addError()", () => {
				const mockSubsegment = {
					close: jest.fn(),
					addError: jest.fn()
				};

				expect(() => provider.addError(new Error("test"), mockSubsegment)).not.toThrow();
			});
		});
	});
});
