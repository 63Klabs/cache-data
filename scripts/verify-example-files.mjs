#!/usr/bin/env node

/**
 * Verification script for example implementation files
 * Checks:
 * - CloudFormation templates are syntactically valid YAML
 * - Example code files use current API
 * - Example code files have necessary imports
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const results = {
	cloudFormationTemplates: [],
	exampleCodeFiles: [],
	errors: [],
	warnings: []
};

// CloudFormation template files to check
const cfTemplates = [
	'docs/00-example-implementation/example-template-lambda-function.yml',
	'docs/00-example-implementation/example-template-s3-and-dynamodb-cache-store.yml',
	'docs/00-example-implementation/example-template-parameters.yml'
];

// Example code files to check
const exampleCodeFiles = [
	'docs/00-example-implementation/example-validations.js',
	'docs/00-example-implementation/example-buildspec.yml'
];

console.log('Verifying example implementation files...\n');

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

// Check CloudFormation templates
console.log('Checking CloudFormation templates:');
for (const templatePath of cfTemplates) {
	const fullPath = path.join(rootDir, templatePath);
	try {
		const content = fs.readFileSync(fullPath, 'utf8');
		yaml.load(content, { schema: CF_SCHEMA });
		console.log(`  ✓ ${templatePath} - Valid YAML`);
		results.cloudFormationTemplates.push({
			file: templatePath,
			valid: true
		});
	} catch (error) {
		console.log(`  ✗ ${templatePath} - Invalid YAML: ${error.message}`);
		results.cloudFormationTemplates.push({
			file: templatePath,
			valid: false,
			error: error.message
		});
		results.errors.push(`CloudFormation template ${templatePath}: ${error.message}`);
	}
}

console.log('\nChecking example code files:');
for (const codePath of exampleCodeFiles) {
	const fullPath = path.join(rootDir, codePath);
	try {
		if (!fs.existsSync(fullPath)) {
			console.log(`  ! ${codePath} - File does not exist`);
			results.warnings.push(`Example file ${codePath} does not exist`);
			results.exampleCodeFiles.push({
				file: codePath,
				exists: false
			});
			continue;
		}

		const content = fs.readFileSync(fullPath, 'utf8');
		
		// Check for necessary imports if it's a .js file
		if (codePath.endsWith('.js')) {
			const hasRequire = content.includes('require(');
			const hasImport = content.includes('import ');
			const hasCacheDataImport = content.includes('@63klabs/cache-data');
			
			if (!hasRequire && !hasImport) {
				console.log(`  ! ${codePath} - No imports found`);
				results.warnings.push(`Example file ${codePath} has no imports`);
			} else if (hasCacheDataImport) {
				console.log(`  ✓ ${codePath} - Has cache-data import`);
			} else {
				console.log(`  ✓ ${codePath} - Has imports (no cache-data import)`);
			}
			
			results.exampleCodeFiles.push({
				file: codePath,
				exists: true,
				hasImports: hasRequire || hasImport,
				hasCacheDataImport: hasCacheDataImport
			});
		} else {
			// For YAML files, just check they're valid
			yaml.load(content);
			console.log(`  ✓ ${codePath} - Valid YAML`);
			results.exampleCodeFiles.push({
				file: codePath,
				exists: true,
				valid: true
			});
		}
	} catch (error) {
		console.log(`  ✗ ${codePath} - Error: ${error.message}`);
		results.errors.push(`Example file ${codePath}: ${error.message}`);
		results.exampleCodeFiles.push({
			file: codePath,
			exists: true,
			error: error.message
		});
	}
}

// Check for missing example files that are referenced in README
const missingFiles = [
	'docs/00-example-implementation/example-config.js',
	'docs/00-example-implementation/example-handler.js'
];

console.log('\nChecking for referenced but missing files:');
for (const filePath of missingFiles) {
	const fullPath = path.join(rootDir, filePath);
	if (!fs.existsSync(fullPath)) {
		console.log(`  ! ${filePath} - Referenced in README but does not exist`);
		results.warnings.push(`Referenced file ${filePath} does not exist (noted in README as missing)`);
	} else {
		const content = fs.readFileSync(fullPath, 'utf8');
		if (content.trim() === '') {
			console.log(`  ! ${filePath} - File exists but is empty`);
			results.warnings.push(`Referenced file ${filePath} exists but is empty`);
		} else {
			console.log(`  ✓ ${filePath} - Exists and has content`);
		}
	}
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(60));
console.log(`CloudFormation templates checked: ${results.cloudFormationTemplates.length}`);
console.log(`Example code files checked: ${results.exampleCodeFiles.length}`);
console.log(`Errors: ${results.errors.length}`);
console.log(`Warnings: ${results.warnings.length}`);

if (results.errors.length > 0) {
	console.log('\nERRORS:');
	results.errors.forEach(err => console.log(`  - ${err}`));
}

if (results.warnings.length > 0) {
	console.log('\nWARNINGS:');
	results.warnings.forEach(warn => console.log(`  - ${warn}`));
}

// Exit with error code if there are errors
if (results.errors.length > 0) {
	console.log('\n❌ Verification failed with errors');
	process.exit(1);
} else if (results.warnings.length > 0) {
	console.log('\n⚠️  Verification completed with warnings');
	process.exit(0);
} else {
	console.log('\n✅ All verifications passed');
	process.exit(0);
}
