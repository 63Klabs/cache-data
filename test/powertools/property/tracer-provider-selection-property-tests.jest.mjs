/**
 * Property 4: Tracer Provider Selection Precedence - Property-Based Tests
 * 
 * Tests the tracer provider selection logic which determines which TracingProvider
 * is selected based on the combination of:
 * - xrayEnvOn: Whether CacheData_AWSXRayOn or CACHE_DATA_AWS_X_RAY_ON is truthy
 * - tracerImportable: Whether @aws-lambda-powertools/tracer can be imported
 * - tracerDisabledByEnv: Whether tracer is disabled via env vars
 * 
 * Precedence rules:
 * 1. PowertoolsTracerProvider when tracerImportable AND NOT tracerDisabledByEnv
 * 2. RawXRayProvider when NOT tracerImportable (or disabled) AND xrayEnvOn
 * 3. NoOpTracingProvider otherwise
 * 
 * Since Powertools packages ARE installed as devDependencies, "tracerImportable"
 * is always true in the test environment. To simulate "not importable", we use
 * CACHE_DATA_POWERTOOLS_TRACER=false (which disables it).
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 * 
 * @private
 * @module test/powertools/property/tracer-provider-selection-property-tests
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fc from "fast-check";
import { createEnvContext } from "../helpers/env-helper.mjs";

// Import the module under test
const PowertoolsInit = await import("../../../src/lib/tools/PowertoolsInit.js");
const { initPowertools, getActiveTracingProvider, TestHarness } = PowertoolsInit.default || PowertoolsInit;
const { resetForTesting } = TestHarness.getInternals();

// Environment context for clean test isolation
const envContext = createEnvContext();

describe("Property 4: Tracer Provider Selection Precedence", () => {

	beforeEach(() => {
		envContext.setup();
		resetForTesting();
	});

	afterEach(() => {
		envContext.teardown();
	});

	describe("Exactly one provider is selected per initialization", () => {

		/**
		 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
		 * 
		 * For any combination of environment variable settings that control tracer
		 * selection, exactly one TracingProvider SHALL be selected and its name SHALL
		 * be one of "powertools-tracer", "raw-xray", or "none".
		 */
		it("Property: exactly one provider is selected for any env var combination", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // tracerDisabled (via CACHE_DATA_POWERTOOLS_TRACER=false)
					fc.boolean(), // globalDisabled (via CACHE_DATA_POWERTOOLS=false)
					fc.boolean(), // xrayOn (via CacheData_AWSXRayOn=true)
					fc.boolean(), // xrayOnAlt (via CACHE_DATA_AWS_X_RAY_ON=true)
					(tracerDisabled, globalDisabled, xrayOn, xrayOnAlt) => {
						resetForTesting();
						envContext.clear();

						if (tracerDisabled) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						}
						if (globalDisabled) {
							process.env.CACHE_DATA_POWERTOOLS = "false";
						}
						if (xrayOn) {
							process.env.CacheData_AWSXRayOn = "true";
						}
						if (xrayOnAlt) {
							process.env.CACHE_DATA_AWS_X_RAY_ON = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						// Exactly one provider must be selected (not null)
						expect(provider).not.toBeNull();

						// Provider name must be one of the three valid values
						const validNames = ["powertools-tracer", "raw-xray", "none"];
						expect(validNames).toContain(provider.name);
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("PowertoolsTracerProvider selected when tracer enabled (default)", () => {

		/**
		 * **Validates: Requirements 4.1, 4.2**
		 * 
		 * When @aws-lambda-powertools/tracer is importable (always true in test env)
		 * and NOT disabled via environment variables, the PowertoolsTracerProvider
		 * SHALL be selected regardless of X-Ray env var state.
		 */
		it("Property: PowertoolsTracerProvider selected when tracer not disabled", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // xrayOn
					fc.boolean(), // xrayOnAlt
					(xrayOn, xrayOnAlt) => {
						resetForTesting();
						envContext.clear();

						// Tracer is NOT disabled (default state)
						// X-Ray env vars can be anything - Powertools takes precedence
						if (xrayOn) {
							process.env.CacheData_AWSXRayOn = "true";
						}
						if (xrayOnAlt) {
							process.env.CACHE_DATA_AWS_X_RAY_ON = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("powertools-tracer");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("RawXRayProvider selected when tracer disabled but X-Ray on", () => {

		/**
		 * **Validates: Requirements 4.3**
		 * 
		 * When tracer is disabled (simulating not importable) AND X-Ray env var is on,
		 * the RawXRayProvider SHALL be selected.
		 */
		it("Property: RawXRayProvider selected when tracer disabled and X-Ray on", () => {
			fc.assert(
				fc.property(
					fc.constantFrom(
						"CACHE_DATA_POWERTOOLS_TRACER",
						"CACHE_DATA_POWERTOOLS"
					), // which env var disables tracer
					fc.constantFrom(
						"CacheData_AWSXRayOn",
						"CACHE_DATA_AWS_X_RAY_ON"
					), // which X-Ray env var is set
					(disableVar, xrayVar) => {
						resetForTesting();
						envContext.clear();

						// Disable tracer via env var
						process.env[disableVar] = "false";
						// Enable X-Ray
						process.env[xrayVar] = "true";

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("raw-xray");
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 4.3**
		 * 
		 * When tracer is disabled via individual flag and X-Ray is on via either
		 * env var, RawXRayProvider is selected.
		 */
		it("Property: RawXRayProvider selected with tracer=false and either X-Ray var", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // use CacheData_AWSXRayOn
					fc.boolean(), // use CACHE_DATA_AWS_X_RAY_ON
					(useXrayVar1, useXrayVar2) => {
						// At least one X-Ray var must be on
						if (!useXrayVar1 && !useXrayVar2) return; // skip this case

						resetForTesting();
						envContext.clear();

						process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						if (useXrayVar1) {
							process.env.CacheData_AWSXRayOn = "true";
						}
						if (useXrayVar2) {
							process.env.CACHE_DATA_AWS_X_RAY_ON = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("raw-xray");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("NoOpTracingProvider selected when all tracing disabled", () => {

		/**
		 * **Validates: Requirements 4.4**
		 * 
		 * When tracer is disabled AND X-Ray env vars are not set to true,
		 * the NoOpTracingProvider SHALL be selected.
		 */
		it("Property: NoOpTracingProvider selected when tracer disabled and X-Ray off", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("false", "0", "no"), // disable value for tracer
					fc.option(fc.constantFrom("false", "0", "", "no"), { nil: undefined }), // X-Ray var value (falsy or unset)
					(disableValue, xrayValue) => {
						resetForTesting();
						envContext.clear();

						process.env.CACHE_DATA_POWERTOOLS_TRACER = disableValue;

						// X-Ray is off (unset or falsy)
						if (xrayValue !== undefined) {
							process.env.CacheData_AWSXRayOn = xrayValue;
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("none");
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 4.4**
		 * 
		 * When global flag disables all Powertools AND X-Ray is off,
		 * NoOpTracingProvider SHALL be selected.
		 */
		it("Property: NoOpTracingProvider selected when global=false and X-Ray off", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("false", "0", "no"), // global disable value
					fc.boolean(), // whether to set X-Ray var at all
					(globalDisableValue, setXrayVar) => {
						resetForTesting();
						envContext.clear();

						process.env.CACHE_DATA_POWERTOOLS = globalDisableValue;

						// X-Ray is off
						if (setXrayVar) {
							process.env.CacheData_AWSXRayOn = "false";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("none");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Precedence: Powertools > RawXRay > NoOp", () => {

		/**
		 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
		 * 
		 * For any combination of (tracerDisabledByEnv, xrayEnvOn), the system
		 * SHALL select the provider according to strict precedence:
		 * 1. PowertoolsTracerProvider when tracer enabled (not disabled by env)
		 * 2. RawXRayProvider when tracer disabled AND xrayEnvOn
		 * 3. NoOpTracingProvider otherwise
		 */
		it("Property: provider selection follows strict precedence rules", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // tracerDisabledByEnv
					fc.boolean(), // xrayEnvOn
					(tracerDisabledByEnv, xrayEnvOn) => {
						resetForTesting();
						envContext.clear();

						if (tracerDisabledByEnv) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						}
						if (xrayEnvOn) {
							process.env.CacheData_AWSXRayOn = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();

						// Apply precedence rules
						if (!tracerDisabledByEnv) {
							// Rule 1: Powertools tracer is importable and not disabled
							expect(provider.name).toBe("powertools-tracer");
						} else if (xrayEnvOn) {
							// Rule 2: Tracer disabled but X-Ray is on
							expect(provider.name).toBe("raw-xray");
						} else {
							// Rule 3: All tracing disabled
							expect(provider.name).toBe("none");
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		/**
		 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
		 * 
		 * Extended precedence test using global disable flag as well.
		 * When global=false, tracer is effectively disabled regardless of
		 * individual tracer flag.
		 */
		it("Property: global disable overrides tracer availability in precedence", () => {
			fc.assert(
				fc.property(
					fc.boolean(), // globalDisabled
					fc.boolean(), // tracerDisabledByIndividualFlag
					fc.boolean(), // xrayEnvOn
					(globalDisabled, tracerDisabledByIndividualFlag, xrayEnvOn) => {
						resetForTesting();
						envContext.clear();

						if (globalDisabled) {
							process.env.CACHE_DATA_POWERTOOLS = "false";
						}
						if (tracerDisabledByIndividualFlag) {
							process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						}
						if (xrayEnvOn) {
							process.env.CacheData_AWSXRayOn = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();

						// Determine effective tracer disabled state
						const tracerEffectivelyDisabled = globalDisabled || tracerDisabledByIndividualFlag;

						if (!tracerEffectivelyDisabled) {
							// Rule 1: Powertools tracer importable and not disabled
							expect(provider.name).toBe("powertools-tracer");
						} else if (xrayEnvOn) {
							// Rule 2: Tracer disabled but X-Ray is on
							expect(provider.name).toBe("raw-xray");
						} else {
							// Rule 3: All tracing disabled
							expect(provider.name).toBe("none");
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("X-Ray env var equivalence", () => {

		/**
		 * **Validates: Requirements 4.3**
		 * 
		 * Both CacheData_AWSXRayOn and CACHE_DATA_AWS_X_RAY_ON should have
		 * equivalent effect on provider selection. Either one being "true" or "1"
		 * should enable X-Ray fallback.
		 */
		it("Property: both X-Ray env vars are equivalent for provider selection", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("true", "1"), // truthy X-Ray value
					fc.constantFrom("CacheData_AWSXRayOn", "CACHE_DATA_AWS_X_RAY_ON"), // which var
					(xrayValue, xrayVarName) => {
						resetForTesting();
						envContext.clear();

						// Disable tracer so we fall through to X-Ray check
						process.env.CACHE_DATA_POWERTOOLS_TRACER = "false";
						// Set one of the X-Ray env vars
						process.env[xrayVarName] = xrayValue;

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();
						expect(provider.name).toBe("raw-xray");
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	describe("Disable value variants", () => {

		/**
		 * **Validates: Requirements 4.4, 4.5**
		 * 
		 * All recognized disable values ("false", "0", "no", case-insensitive)
		 * should effectively disable the tracer, causing fallback behavior.
		 */
		it("Property: all disable value variants correctly disable tracer", () => {
			fc.assert(
				fc.property(
					fc.constantFrom("false", "FALSE", "False", "0", "no", "NO", "No"),
					fc.boolean(), // xrayOn
					(disableValue, xrayOn) => {
						resetForTesting();
						envContext.clear();

						process.env.CACHE_DATA_POWERTOOLS_TRACER = disableValue;
						if (xrayOn) {
							process.env.CacheData_AWSXRayOn = "true";
						}

						initPowertools();
						const provider = getActiveTracingProvider();

						expect(provider).not.toBeNull();

						// Tracer is disabled, so either RawXRay or NoOp
						if (xrayOn) {
							expect(provider.name).toBe("raw-xray");
						} else {
							expect(provider.name).toBe("none");
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
