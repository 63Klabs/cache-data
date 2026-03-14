import { describe, it, expect } from "@jest/globals";
import fc from "fast-check";
import ApiRequest from "../../src/lib/tools/ApiRequest.class.js";

/* ****************************************************************************
 * Response Format Property-Based Tests (Jest)
 * Feature: 1-3-10-new-response-format-method
 *
 * This test suite validates the ApiRequest response format methods using
 * property-based testing with fast-check. It ensures structural invariants
 * and correctness properties hold across many generated inputs.
 */

const EXPECTED_KEYS = ["success", "statusCode", "message", "headers", "body"];

const FC_OPTIONS = {
	numRuns: 100,
	seed: process.env.FC_SEED ? parseInt(process.env.FC_SEED) : undefined
};

describe("ApiRequest Response Format - Property-Based Tests", () => {

	describe("Property 1: Round-Trip Equivalence (responseFormat ↔ format)", () => {
		// Feature: 1-3-10-new-response-format-method, Property 1: Round-Trip Equivalence

		it("should produce identical results from responseFormat(s,c,m,h,b) and format({success:s, statusCode:c, message:m, headers:h, body:b})", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(s, c, m, h, b) => {
						const fromResponseFormat = ApiRequest.responseFormat(s, c, m, h, b);
						const fromFormat = ApiRequest.format({ success: s, statusCode: c, message: m, headers: h, body: b });

						expect(fromResponseFormat).toEqual(fromFormat);
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 2: format() Idempotence", () => {
		// Feature: 1-3-10-new-response-format-method, Property 2: format() Idempotence

		it("should produce identical results when format() output is passed back through format()", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(success, statusCode, message, headers, body) => {
						const opts = { success, statusCode, message, headers, body };
						const firstPass = ApiRequest.format(opts);
						const secondPass = ApiRequest.format(firstPass);

						expect(secondPass).toEqual(firstPass);
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 3: format() Structural Invariant", () => {
		// Feature: 1-3-10-new-response-format-method, Property 3: format() Structural Invariant

		it("should return an object with exactly 5 keys for any valid Format_Options", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(success, statusCode, message, headers, body) => {
						const result = ApiRequest.format({ success, statusCode, message, headers, body });
						const keys = Object.keys(result);

						expect(keys).toHaveLength(5);
						expect(keys).toEqual(expect.arrayContaining(EXPECTED_KEYS));
					}
				),
				FC_OPTIONS
			);
		});

		it("should return an object with exactly 5 keys when called with no arguments", () => {
			const result = ApiRequest.format();
			const keys = Object.keys(result);

			expect(keys).toHaveLength(5);
			expect(keys).toEqual(expect.arrayContaining(EXPECTED_KEYS));
		});

		it("should return an object with exactly 5 keys for partial Format_Options", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.record({ success: fc.boolean() }),
						fc.record({ statusCode: fc.integer() }),
						fc.record({ message: fc.oneof(fc.string(), fc.constant(null)) }),
						fc.record({ headers: fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)) }),
						fc.record({ body: fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)) }),
						fc.record({ success: fc.boolean(), statusCode: fc.integer() }),
						fc.record({ message: fc.oneof(fc.string(), fc.constant(null)), body: fc.oneof(fc.string(), fc.constant(null)) })
					),
					(partialOpts) => {
						const result = ApiRequest.format(partialOpts);
						const keys = Object.keys(result);

						expect(keys).toHaveLength(5);
						expect(keys).toEqual(expect.arrayContaining(EXPECTED_KEYS));
					}
				),
				FC_OPTIONS
			);
		});

		it("should return an object with exactly 5 keys when called with empty object", () => {
			const result = ApiRequest.format({});
			const keys = Object.keys(result);

			expect(keys).toHaveLength(5);
			expect(keys).toEqual(expect.arrayContaining(EXPECTED_KEYS));
		});
	});

	describe("Property 4: format() Value Preservation", () => {
		// Feature: 1-3-10-new-response-format-method, Property 4: format() Value Preservation

		it("should preserve all provided property values in the returned object", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(success, statusCode, message, headers, body) => {
						const result = ApiRequest.format({ success, statusCode, message, headers, body });

						expect(result.success).toBe(success);
						expect(result.statusCode).toBe(statusCode);
						expect(result.message).toEqual(message);
						expect(result.headers).toEqual(headers);
						expect(result.body).toEqual(body);
					}
				),
				FC_OPTIONS
			);
		});

		it("should use default values for omitted properties", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant("success"),
						fc.constant("statusCode"),
						fc.constant("message"),
						fc.constant("headers"),
						fc.constant("body")
					),
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(includedKey, success, statusCode, message, headers, body) => {
						const allValues = { success, statusCode, message, headers, body };
						const partialOpts = { [includedKey]: allValues[includedKey] };
						const result = ApiRequest.format(partialOpts);

						const defaults = { success: false, statusCode: 0, message: null, headers: null, body: null };

						for (const key of EXPECTED_KEYS) {
							if (key === includedKey) {
								expect(result[key]).toEqual(allValues[key]);
							} else {
								expect(result[key]).toEqual(defaults[key]);
							}
						}
					}
				),
				FC_OPTIONS
			);
		});

		it("should preserve values when multiple but not all properties are provided", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					(success, statusCode) => {
						const result = ApiRequest.format({ success, statusCode });

						expect(result.success).toBe(success);
						expect(result.statusCode).toBe(statusCode);
						expect(result.message).toBeNull();
						expect(result.headers).toBeNull();
						expect(result.body).toBeNull();
					}
				),
				FC_OPTIONS
			);
		});
	});

	describe("Property 5: success() Default Success Flag", () => {
		// Feature: 1-3-10-new-response-format-method, Property 5: success() Default Success Flag

		it("should return success === true when success property is not explicitly provided", () => {
			fc.assert(
				fc.property(
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(statusCode, message, headers, body) => {
						const result = ApiRequest.success({ statusCode, message, headers, body });

						expect(result.success).toBe(true);
					}
				),
				FC_OPTIONS
			);
		});

		it("should return success === true when called with no arguments", () => {
			const result = ApiRequest.success();

			expect(result.success).toBe(true);
		});

		it("should return success === true when called with empty object", () => {
			const result = ApiRequest.success({});

			expect(result.success).toBe(true);
		});
	});

	describe("Property 6: error() Default Success Flag", () => {
		// Feature: 1-3-10-new-response-format-method, Property 6: error() Default Success Flag

		it("should return success === false when success property is not explicitly provided", () => {
			fc.assert(
				fc.property(
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(statusCode, message, headers, body) => {
						const result = ApiRequest.error({ statusCode, message, headers, body });

						expect(result.success).toBe(false);
					}
				),
				FC_OPTIONS
			);
		});

		it("should return success === false when called with no arguments", () => {
			const result = ApiRequest.error();

			expect(result.success).toBe(false);
		});

		it("should return success === false when called with empty object", () => {
			const result = ApiRequest.error({});

			expect(result.success).toBe(false);
		});
	});

	describe("Property 7: apiGateway() Structural Invariant", () => {
		// Feature: 1-3-10-new-response-format-method, Property 7: apiGateway() Structural Invariant

		it("should return an object with exactly 3 keys (statusCode, headers, body) and never contain success or message", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(success, statusCode, message, headers, body) => {
						const result = ApiRequest.apiGateway({ success, statusCode, message, headers, body });
						const keys = Object.keys(result);

						expect(keys).toHaveLength(3);
						expect(keys).toEqual(["statusCode", "headers", "body"]);
						expect(result).not.toHaveProperty("success");
						expect(result).not.toHaveProperty("message");
					}
				),
				FC_OPTIONS
			);
		});

		it("should return exactly 3 keys when called with no arguments", () => {
			const result = ApiRequest.apiGateway();
			const keys = Object.keys(result);

			expect(keys).toHaveLength(3);
			expect(keys).toEqual(["statusCode", "headers", "body"]);
			expect(result).not.toHaveProperty("success");
			expect(result).not.toHaveProperty("message");
		});
	});

	describe("Property 8: apiGateway() Body Stringification", () => {
		// Feature: 1-3-10-new-response-format-method, Property 8: apiGateway() Body Stringification

		it("should stringify non-null object bodies", () => {
			fc.assert(
				fc.property(
					fc.dictionary(fc.string(), fc.jsonValue()),
					(body) => {
						const result = ApiRequest.apiGateway({ body });

						expect(result.body).toBe(JSON.stringify(body));
					}
				),
				FC_OPTIONS
			);
		});

		it("should pass string bodies through unchanged", () => {
			fc.assert(
				fc.property(
					fc.string(),
					(body) => {
						const result = ApiRequest.apiGateway({ body });

						expect(result.body).toBe(body);
					}
				),
				FC_OPTIONS
			);
		});

		it("should pass null body through unchanged", () => {
			const result = ApiRequest.apiGateway({ body: null });

			expect(result.body).toBeNull();
		});
	});

	describe("Property 9: apiGateway() Preserves statusCode and headers", () => {
		// Feature: 1-3-10-new-response-format-method, Property 9: apiGateway() Preserves statusCode and headers

		it("should preserve statusCode and headers from format()", () => {
			fc.assert(
				fc.property(
					fc.boolean(),
					fc.integer(),
					fc.oneof(fc.string(), fc.constant(null)),
					fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(null)),
					fc.oneof(fc.string(), fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(null)),
					(success, statusCode, message, headers, body) => {
						const opts = { success, statusCode, message, headers, body };
						const gatewayResult = ApiRequest.apiGateway(opts);
						const formatResult = ApiRequest.format(opts);

						expect(gatewayResult.statusCode).toBe(formatResult.statusCode);
						expect(gatewayResult.headers).toEqual(formatResult.headers);
					}
				),
				FC_OPTIONS
			);
		});
	});
});
