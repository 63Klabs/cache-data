import { expect } from 'chai';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ****************************************************************************
 * Example Code Property-Based Tests
 * Feature: documentation-enhancement
 * Properties 9-12: Example Code Validation
 */

// CloudFormation YAML schema with custom tags
const CF_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
	new yaml.Type('!Ref', { kind: 'scalar' }),
	new yaml.Type('!GetAtt', { kind: 'scalar' }),
	new yaml.Type('!Sub', { kind: 'scalar' }),
	new yaml.Type('!Join', { kind: 'sequence' }),
	new yaml.Type('!Select', { kind: 'sequence' }),
	new yaml.Type('!Split', { kind: 'sequence' }),
	new yaml.Type('!If', { kind: 'sequence' }),
	new yaml.Type('!Equals', { kind: 'sequence' }),
	new yaml.Type('!Not', { kind: 'sequence' }),
	new yaml.Type('!And', { kind: 'sequence' }),
	new yaml.Type('!Or', { kind: 'sequence' }),
	new yaml.Type('!FindInMap', { kind: 'sequence' }),
	new yaml.Type('!GetAZs', { kind: 'scalar' }),
	new yaml.Type('!ImportValue', { kind: 'scalar' }),
	new yaml.Type('!Base64', { kind: 'scalar' })
]);

/**
 * Get all JavaScript example files
 */
function getExampleJSFiles() {
	const exampleDir = path.join(__dirname, '../../../docs/00-example-implementation');
	const files = fs.readdirSync(exampleDir);
	return files
		.filter(f => f.endsWith('.js'))
		.map(f => path.join(exampleDir, f));
}

/**
 * Get all CloudFormation template files
 */
function getCloudFormationTemplates() {
	const exampleDir = path.join(__dirname, '../../../docs/00-example-implementation');
	const files = fs.readdirSync(exampleDir);
	return files
		.filter(f => f.startsWith('example-template-') && f.endsWith('.yml'))
		.map(f => path.join(exampleDir, f));
}

/**
 * Check if code uses deprecated API patterns
 */
function hasDeprecatedAPI(code) {
	const deprecatedPatterns = [
		/getDataDirectFromURI/,  // Deprecated alias for endpoint.get
		// Add more deprecated patterns as they are identified
	];

	for (const pattern of deprecatedPatterns) {
		if (pattern.test(code)) {
			return { deprecated: true, pattern: pattern.toString() };
		}
	}

	return { deprecated: false };
}

/**
 * Extract required configuration fields from code
 */
function extractRequiredConfigFields(code) {
	const requiredFields = [];
	
	// Look for environment variable references
	const envVarPattern = /process\.env\.(\w+)/g;
	let match;
	while ((match = envVarPattern.exec(code)) !== null) {
		requiredFields.push(match[1]);
	}

	return requiredFields;
}

describe("Example Code - Property-Based Tests", () => {

	describe("Property 9: Example Code Import Completeness", () => {
		// Feature: documentation-enhancement, Property 9: Example Code Import Completeness
		// Validates: Requirements 7.2

		it("should have necessary imports for all package functionality used", () => {
			const exampleFiles = getExampleJSFiles();
			const issues = [];

			for (const filePath of exampleFiles) {
				const fileName = path.basename(filePath);
				const content = fs.readFileSync(filePath, 'utf-8');

				// Skip empty files
				if (content.trim() === '') {
					continue;
				}

				// Check if file uses cache-data package
				const usesCacheData = 
					content.includes('cache') ||
					content.includes('endpoint') ||
					content.includes('tools') ||
					content.includes('DebugAndLog') ||
					content.includes('Timer') ||
					content.includes('Response');

				if (usesCacheData) {
					// Check for import/require statement
					const hasImport = 
						content.includes('require("@63klabs/cache-data")') ||
						content.includes("require('@63klabs/cache-data')") ||
						content.includes('import') && content.includes('@63klabs/cache-data');

					if (!hasImport) {
						issues.push(`${fileName}: Uses cache-data functionality but missing import statement`);
					}

					// Check for specific module imports
					if (content.includes('DebugAndLog') || content.includes('Timer')) {
						const hasToolsImport = 
							content.includes('tools') ||
							content.includes('DebugAndLog') ||
							content.includes('Timer');
						
						if (!hasToolsImport) {
							issues.push(`${fileName}: Uses tools module but doesn't import it`);
						}
					}
				}

				// Check for other common imports that might be needed
				if (content.includes('fs.') && !content.includes('require') && !content.includes('import')) {
					issues.push(`${fileName}: Uses fs module but missing import`);
				}
			}

			if (issues.length > 0) {
				console.log('\nExample Code Import Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} import completeness issues`);
		});

		it("should use property-based testing to verify import patterns", () => {
			// Property: For any example file that uses package functionality,
			// it must have the corresponding import statement

			const exampleFiles = getExampleJSFiles();
			
			fc.assert(
				fc.property(
					fc.constantFrom(...exampleFiles.filter(f => {
						const content = fs.readFileSync(f, 'utf-8');
						return content.trim() !== '';
					})),
					(filePath) => {
						const content = fs.readFileSync(filePath, 'utf-8');
						const fileName = path.basename(filePath);

						// If file uses cache-data functionality
						const usesCacheData = 
							content.includes('cache') ||
							content.includes('endpoint') ||
							content.includes('tools') ||
							content.includes('DebugAndLog');

						if (!usesCacheData) {
							return true; // No cache-data usage, no import needed
						}

						// Must have import
						const hasImport = 
							content.includes('require("@63klabs/cache-data")') ||
							content.includes("require('@63klabs/cache-data')") ||
							(content.includes('import') && content.includes('@63klabs/cache-data'));

						return hasImport;
					}
				),
				{ numRuns: 10 }
			);
		});
	});

	describe("Property 10: Example Code API Currency", () => {
		// Feature: documentation-enhancement, Property 10: Example Code API Currency
		// Validates: Requirements 7.1

		it("should not use deprecated methods or patterns", () => {
			const exampleFiles = getExampleJSFiles();
			const issues = [];

			for (const filePath of exampleFiles) {
				const fileName = path.basename(filePath);
				const content = fs.readFileSync(filePath, 'utf-8');

				// Skip empty files
				if (content.trim() === '') {
					continue;
				}

				const deprecatedCheck = hasDeprecatedAPI(content);
				if (deprecatedCheck.deprecated) {
					issues.push(`${fileName}: Uses deprecated API pattern ${deprecatedCheck.pattern}`);
				}
			}

			if (issues.length > 0) {
				console.log('\nExample Code API Currency Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} deprecated API usage issues`);
		});

		it("should use property-based testing to verify no deprecated APIs", () => {
			// Property: For any example file, it must not contain deprecated API patterns

			const exampleFiles = getExampleJSFiles();
			
			fc.assert(
				fc.property(
					fc.constantFrom(...exampleFiles.filter(f => {
						const content = fs.readFileSync(f, 'utf-8');
						return content.trim() !== '';
					})),
					(filePath) => {
						const content = fs.readFileSync(filePath, 'utf-8');
						const deprecatedCheck = hasDeprecatedAPI(content);
						return !deprecatedCheck.deprecated;
					}
				),
				{ numRuns: 10 }
			);
		});
	});

	describe("Property 11: CloudFormation Template Syntax Validity", () => {
		// Feature: documentation-enhancement, Property 11: CloudFormation Template Syntax Validity
		// Validates: Requirements 7.5

		it("should have syntactically valid YAML in all CloudFormation templates", () => {
			const templates = getCloudFormationTemplates();
			const issues = [];

			for (const templatePath of templates) {
				const fileName = path.basename(templatePath);
				const content = fs.readFileSync(templatePath, 'utf-8');

				try {
					yaml.load(content, { schema: CF_SCHEMA });
				} catch (error) {
					issues.push(`${fileName}: Invalid YAML - ${error.message}`);
				}
			}

			if (issues.length > 0) {
				console.log('\nCloudFormation Template Syntax Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} CloudFormation syntax issues`);
		});

		it("should use property-based testing to verify template validity", () => {
			// Property: For any CloudFormation template file, it must be valid YAML

			const templates = getCloudFormationTemplates();
			
			fc.assert(
				fc.property(
					fc.constantFrom(...templates),
					(templatePath) => {
						const content = fs.readFileSync(templatePath, 'utf-8');
						try {
							yaml.load(content, { schema: CF_SCHEMA });
							return true;
						} catch (error) {
							return false;
						}
					}
				),
				{ numRuns: 10 }
			);
		});

		it("should have required CloudFormation sections", () => {
			const templates = getCloudFormationTemplates();
			const issues = [];

			for (const templatePath of templates) {
				const fileName = path.basename(templatePath);
				const content = fs.readFileSync(templatePath, 'utf-8');

				try {
					const parsed = yaml.load(content, { schema: CF_SCHEMA });
					
					// Check for Resources section (required in all CF templates)
					if (!parsed.Resources) {
						issues.push(`${fileName}: Missing required 'Resources' section`);
					}
				} catch (error) {
					// Already caught by syntax validity test
				}
			}

			if (issues.length > 0) {
				console.log('\nCloudFormation Template Structure Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} CloudFormation structure issues`);
		});
	});

	describe("Property 12: Configuration Example Completeness", () => {
		// Feature: documentation-enhancement, Property 12: Configuration Example Completeness
		// Validates: Requirements 7.4

		it("should have complete configuration examples with all required fields", () => {
			const templatePath = path.join(__dirname, '../../../docs/00-example-implementation/example-template-lambda-function.yml');
			const content = fs.readFileSync(templatePath, 'utf-8');
			const issues = [];

			try {
				const parsed = yaml.load(content, { schema: CF_SCHEMA });
				
				// Check for Lambda function with environment variables
				if (parsed.Resources) {
					const lambdaFunctions = Object.entries(parsed.Resources)
						.filter(([key, resource]) => resource.Type === 'AWS::Serverless::Function');

					for (const [name, func] of lambdaFunctions) {
						if (!func.Properties) {
							issues.push(`${name}: Missing Properties section`);
							continue;
						}

						if (!func.Properties.Environment) {
							issues.push(`${name}: Missing Environment section`);
							continue;
						}

						if (!func.Properties.Environment.Variables) {
							issues.push(`${name}: Missing Environment Variables`);
							continue;
						}

						const envVars = func.Properties.Environment.Variables;

						// Check for required cache-data environment variables
						const requiredVars = [
							'CACHE_DATA_DYNAMO_DB_TABLE',
							'CACHE_DATA_S3_BUCKET'
						];

						for (const varName of requiredVars) {
							if (!(varName in envVars)) {
								issues.push(`${name}: Missing required environment variable ${varName}`);
							}
						}

						// Check for IAM role
						if (!func.Properties.Role) {
							issues.push(`${name}: Missing IAM Role configuration`);
						}
					}
				}
			} catch (error) {
				issues.push(`Failed to parse template: ${error.message}`);
			}

			if (issues.length > 0) {
				console.log('\nConfiguration Completeness Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} configuration completeness issues`);
		});

		it("should have IAM permissions for cache-data operations", () => {
			const templatePath = path.join(__dirname, '../../../docs/00-example-implementation/example-template-lambda-function.yml');
			const content = fs.readFileSync(templatePath, 'utf-8');
			const issues = [];

			try {
				const parsed = yaml.load(content, { schema: CF_SCHEMA });
				
				// Check for IAM role with required permissions
				if (parsed.Resources) {
					const iamRoles = Object.entries(parsed.Resources)
						.filter(([key, resource]) => resource.Type === 'AWS::IAM::Role');

					for (const [name, role] of iamRoles) {
						if (!role.Properties || !role.Properties.Policies) {
							continue;
						}

						const policies = role.Properties.Policies;
						let hasS3Access = false;
						let hasDynamoAccess = false;
						let hasSSMAccess = false;

						for (const policy of policies) {
							if (!policy.PolicyDocument || !policy.PolicyDocument.Statement) {
								continue;
							}

							for (const statement of policy.PolicyDocument.Statement) {
								const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
								
								// Check for S3 permissions
								if (actions.some(a => a.includes('s3:'))) {
									hasS3Access = true;
								}

								// Check for DynamoDB permissions
								if (actions.some(a => a.includes('dynamodb:'))) {
									hasDynamoAccess = true;
								}

								// Check for SSM permissions
								if (actions.some(a => a.includes('ssm:'))) {
									hasSSMAccess = true;
								}
							}
						}

						if (!hasS3Access) {
							issues.push(`${name}: Missing S3 access permissions for cache-data`);
						}
						if (!hasDynamoAccess) {
							issues.push(`${name}: Missing DynamoDB access permissions for cache-data`);
						}
						if (!hasSSMAccess) {
							issues.push(`${name}: Missing SSM Parameter Store access permissions for cache-data`);
						}
					}
				}
			} catch (error) {
				issues.push(`Failed to parse template: ${error.message}`);
			}

			if (issues.length > 0) {
				console.log('\nIAM Permissions Issues:');
				issues.forEach(issue => console.log(`  - ${issue}`));
			}

			expect(issues).to.have.lengthOf(0, `Found ${issues.length} IAM permission issues`);
		});
	});
});
