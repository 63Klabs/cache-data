"use strict";

/**
 * Service-client packages loaded by each AWS service accessor.
 *
 * Shared by the child-process fixture (test/tools/fixtures/aws-classes-child.cjs)
 * and the runner (test/helpers/aws-classes-child-runner.mjs), so expected package
 * sets are defined once. Test-owned data, not code under test.
 *
 * Spec: .kiro/specs/1-4-0-convert-aws-to-lazy-accessors (Requirement 1)
 *
 * @type {Readonly<{dynamo: ReadonlyArray<string>, s3: ReadonlyArray<string>, ssm: ReadonlyArray<string>, secrets: ReadonlyArray<string>}>}
 * @example
 * const { SERVICE_PACKAGES } = require("./service-packages.cjs");
 * SERVICE_PACKAGES.dynamo; // ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"]
 */
const SERVICE_PACKAGES = Object.freeze({
	dynamo: Object.freeze(["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"]),
	s3: Object.freeze(["@aws-sdk/client-s3"]),
	ssm: Object.freeze(["@aws-sdk/client-ssm"]),
	secrets: Object.freeze(["@aws-sdk/client-secrets-manager"])
});

module.exports = { SERVICE_PACKAGES };
