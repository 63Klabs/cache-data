# Security Fixes

Potential security issues were discovered by GitHub code scanner in the scripts used to generate and validate documentation.

While these do not pose a risk in production code, we should use best practices when implementing any solution, even if it is for maintaining the documentation and tests.

- [Shell command built from environment values #47](https://github.com/63Klabs/cache-data/security/code-scanning/47)
- [Shell command built from environment values #48](https://github.com/63Klabs/cache-data/security/code-scanning/48)
- [Incomplete string escaping or encoding #49](https://github.com/63Klabs/cache-data/security/code-scanning/49)

The analysis from the GitHub automated code reviews follow. Please review and propose solutions for resolving these with the following notes:

1. These are maintainance scripts ran locally and not part of a production function
2. These are analysis reports from a third party, Kiro may have different solutions

Come up with recommendations and ask any clarifying questions for the user in SPEC-QUESTIONS.md and the user will answer them there before starting the spec driven workflow.

Analysis from GitHub:

## Shell command built from environment values #47 

```js
// scripts/audit-documentation.mjs:641

    fs.writeFileSync(tempFile, code);

    // Try to parse with Node.js
    await execAsync(`node --check ${tempFile}`);

/*
Shell command built from environment values
This shell command depends on an uncontrolled absolute path. 
*/
		
    return { valid: true };
} catch (error) {
```

Dynamically constructing a shell command with values from the local environment, such as file paths, may inadvertently change the meaning of the shell command. Such changes can occur when an environment value contains characters that the shell interprets in a special way, for instance quotes and spaces. This can result in the shell command misbehaving, or even allowing a malicious user to execute arbitrary commands on the system.

Recommendation

If possible, use hard-coded string literals to specify the shell command to run, and provide the dynamic arguments to the shell command separately to avoid interpretation by the shell.

Alternatively, if the shell command must be constructed dynamically, then add code to ensure that special characters in environment values do not alter the shell command unexpectedly.
Example

The following example shows a dynamically constructed shell command that recursively removes a temporary directory that is located next to the currently executing JavaScript file. Such utilities are often found in custom build scripts.

```js
var cp = require("child_process"),
  path = require("path");
function cleanupTemp() {
  let cmd = "rm -rf " + path.join(__dirname, "temp");
  cp.execSync(cmd); // BAD
}
```

The shell command will, however, fail to work as intended if the absolute path of the script's directory contains spaces. In that case, the shell command will interpret the absolute path as multiple paths, instead of a single path.

For instance, if the absolute path of the temporary directory is /home/username/important project/temp, then the shell command will recursively delete /home/username/important and project/temp, where the latter path gets resolved relative to the working directory of the JavaScript process.

Even worse, although less likely, a malicious user could provide the path /home/username/; cat /etc/passwd #/important project/temp in order to execute the command cat /etc/passwd.

To avoid such potentially catastrophic behaviors, provide the directory as an argument that does not get interpreted by a shell:

```js
var cp = require("child_process"),
  path = require("path");
function cleanupTemp() {
  let cmd = "rm",
    args = ["-rf", path.join(__dirname, "temp")];
  cp.execFileSync(cmd, args); // GOOD
}
```

## Shell command built from environment values #48 

```js
// test/documentation/property/executable-example-validation-tests.mjs:104

		}
		
		fs.writeFileSync(tempFile, codeToValidate);
		await execAsync(`node --check ${tempFile}`);
// Warning
// Shell command built from environment values
// This shell command depends on an uncontrolled absolute path.
// CodeQL
		return { valid: true };
	} catch (error) {
		return {
```

Dynamically constructing a shell command with values from the local environment, such as file paths, may inadvertently change the meaning of the shell command. Such changes can occur when an environment value contains characters that the shell interprets in a special way, for instance quotes and spaces. This can result in the shell command misbehaving, or even allowing a malicious user to execute arbitrary commands on the system.
Recommendation

If possible, use hard-coded string literals to specify the shell command to run, and provide the dynamic arguments to the shell command separately to avoid interpretation by the shell.

Alternatively, if the shell command must be constructed dynamically, then add code to ensure that special characters in environment values do not alter the shell command unexpectedly.
Example

The following example shows a dynamically constructed shell command that recursively removes a temporary directory that is located next to the currently executing JavaScript file. Such utilities are often found in custom build scripts.

```js
var cp = require("child_process"),
  path = require("path");
function cleanupTemp() {
  let cmd = "rm -rf " + path.join(__dirname, "temp");
  cp.execSync(cmd); // BAD
}
```

The shell command will, however, fail to work as intended if the absolute path of the script's directory contains spaces. In that case, the shell command will interpret the absolute path as multiple paths, instead of a single path.

For instance, if the absolute path of the temporary directory is /home/username/important project/temp, then the shell command will recursively delete /home/username/important and project/temp, where the latter path gets resolved relative to the working directory of the JavaScript process.

Even worse, although less likely, a malicious user could provide the path /home/username/; cat /etc/passwd #/important project/temp in order to execute the command cat /etc/passwd.

To avoid such potentially catastrophic behaviors, provide the directory as an argument that does not get interpreted by a shell:

```js
var cp = require("child_process"),
  path = require("path");
function cleanupTemp() {
  let cmd = "rm",
    args = ["-rf", path.join(__dirname, "temp")];
  cp.execFileSync(cmd, args); // GOOD
}
```

## Incomplete string escaping or encoding #49

```js
// scripts/audit-documentation.mjs:129
			const [, type, name, description] = paramMatch;
			const isOptional = name.startsWith('[') && name.endsWith(']');
			const cleanName = name.replace(/[\[\]]/g, '').split('=')[0];
			const defaultValue = name.includes('=') ? name.split('=')[1].replace(']', '') : null;
// Warning
// Incomplete string escaping or encoding
// This replaces only the first occurrence of ']'.
// CodeQL
			
			parsed.params.push({
				name: cleanName,
```

Sanitizing untrusted input is a common technique for preventing injection attacks such as SQL injection or cross-site scripting. Usually, this is done by escaping meta-characters such as quotes in a domain-specific way so that they are treated as normal characters.

However, directly using the string replace method to perform escaping is notoriously error-prone. Common mistakes include only replacing the first occurrence of a meta-character, or backslash-escaping various meta-characters but not the backslash itself.

In the former case, later meta-characters are left undisturbed and can be used to subvert the sanitization. In the latter case, preceding a meta-character with a backslash leads to the backslash being escaped, but the meta-character appearing un-escaped, which again makes the sanitization ineffective.

Even if the escaped string is not used in a security-critical context, incomplete escaping may still have undesirable effects, such as badly rendered or confusing output.
Recommendation

Use a (well-tested) sanitization library if at all possible. These libraries are much more likely to handle corner cases correctly than a custom implementation.

An even safer alternative is to design the application so that sanitization is not needed, for instance by using prepared statements for SQL queries.

Otherwise, make sure to use a regular expression with the g flag to ensure that all occurrences are replaced, and remember to escape backslashes if applicable.
Example

For example, assume that we want to embed a user-controlled string accountNumber into a SQL query as part of a string literal. To avoid SQL injection, we need to ensure that the string does not contain un-escaped single-quote characters. The following function attempts to ensure this by doubling single quotes, and thereby escaping them:

```js
function escapeQuotes(s) {
  return s.replace("'", "''");
}
```

As written, this sanitizer is ineffective: if the first argument to replace is a string literal (as in this case), only the first occurrence of that string is replaced.

As mentioned above, the function escapeQuotes should be replaced with a purpose-built sanitization library, such as the npm module sqlstring. Many other sanitization libraries are available from npm and other sources.

If this is not an option, escapeQuotes should be rewritten to use a regular expression with the g ("global") flag instead:

```js
function escapeQuotes(s) {
  return s.replace(/'/g, "''");
}
```

Note that it is very important to include the global flag: s.replace(/'/, "''") without the global flag is equivalent to the first example above and only replaces the first quote.