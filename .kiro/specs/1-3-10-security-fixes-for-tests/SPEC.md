# Security Fixes for Tests

GitHub code scanning identified 2 security issues across 3 scripts. Luckily they are in test scripts and not production code. However they need to be remediated and we'll need to ensure our testing and security steering documents ensure this does not happen in future development projects.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.

## 1. Incomplete string escaping or encoding

This appears in two places
[Security Issue #50](https://github.com/63Klabs/cache-data/security/code-scanning/50)
[Security Issue #51](https://github.com/63Klabs/cache-data/security/code-scanning/51)

test/helpers/jsdoc-parser.mjs:78
```js
const [, name, description] = nameMatch;
const isOptional = name.startsWith('[') && name.endsWith(']');
const cleanName = name.replace(/[\[\]]/g, '').split('=')[0];
const defaultValue = name.includes('=') ? name.split('=')[1].replace(']', '') : null;
// Warning
// Incomplete string escaping or encoding
// This replaces only the first occurrence of ']'.
// CodeQL

return {
    name: cleanName,
```

scripts/audit-documentation.mjs:155
```js
const [, name, description] = nameMatch;
const isOptional = name.startsWith('[') && name.endsWith(']');
const cleanName = name.replace(/[\[\]]/g, '').split('=')[0];
const defaultValue = name.includes('=') ? name.split('=')[1].replace(']', '') : null;
// Warning
// Incomplete string escaping or encoding
// This replaces only the first occurrence of ']'.
// CodeQL
		
return {
    name: cleanName,
```

Sanitizing untrusted input is a common technique for preventing injection attacks such as SQL injection or cross-site scripting. Usually, this is done by escaping meta-characters such as quotes in a domain-specific way so that they are treated as normal characters.

However, directly using the string replace method to perform escaping is notoriously error-prone. Common mistakes include only replacing the first occurrence of a meta-character, or backslash-escaping various meta-characters but not the backslash itself.

In the former case, later meta-characters are left undisturbed and can be used to subvert the sanitization. In the latter case, preceding a meta-character with a backslash leads to the backslash being escaped, but the meta-character appearing un-escaped, which again makes the sanitization ineffective.

Even if the escaped string is not used in a security-critical context, incomplete escaping may still have undesirable effects, such as badly rendered or confusing output.

### Recommendation

Use a (well-tested) sanitization library if at all possible. These libraries are much more likely to handle corner cases correctly than a custom implementation.

An even safer alternative is to design the application so that sanitization is not needed, for instance by using prepared statements for SQL queries.

Otherwise, make sure to use a regular expression with the g flag to ensure that all occurrences are replaced, and remember to escape backslashes if applicable.

### Example

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

### References

- OWASP Top 10: A1 Injection.
- npm: sqlstring package.
- Common Weakness Enumeration: CWE-20.
- Common Weakness Enumeration: CWE-80.
- Common Weakness Enumeration: CWE-116.

## 2. Prototype-polluting assignment

[Security Issue #52](https://github.com/63Klabs/cache-data/security/code-scanning/52)

src/lib/tools/index.js:471
```js
}

// store key and value
paramstore[group][name] = param.Value;
// Warning
// Prototype-polluting assignment
// This assignment may alter Object.prototype if a malicious '__proto__' string is injected from library input.
// CodeQL
});

}
```

Most JavaScript objects inherit the properties of the built-in Object.prototype object. Prototype pollution is a type of vulnerability in which an attacker is able to modify Object.prototype. Since most objects inherit from the compromised Object.prototype object, the attacker can use this to tamper with the application logic, and often escalate to remote code execution or cross-site scripting.

One way to cause prototype pollution is by modifying an object obtained via a user-controlled property name. Most objects have a special __proto__ property that refers to Object.prototype. An attacker can abuse this special property to trick the application into performing unintended modifications of Object.prototype.

### Recommendation

Use an associative data structure that is resilient to untrusted key values, such as a Map. In some cases, a prototype-less object created with Object.create(null) may be preferable.

Alternatively, restrict the computed property name so it can't clash with a built-in property, either by prefixing it with a constant string, or by rejecting inputs that don't conform to the expected format.

### Example

In the example below, the untrusted value req.params.id is used as the property name req.session.todos[id]. If a malicious user passes in the ID value __proto__, the variable items will then refer to Object.prototype. Finally, the modification of items then allows the attacker to inject arbitrary properties onto Object.prototype.

```js
let express = require('express');
let app = express()

app.put('/todos/:id', (req, res) => {
    let id = req.params.id;
    let items = req.session.todos[id];
    if (!items) {
        items = req.session.todos[id] = {};
    }
    items[req.query.name] = req.query.text;
    res.end(200);
});
```

One way to fix this is to use Map objects to associate key/value pairs instead of regular objects, as shown below:

```js
let express = require('express');
let app = express()

app.put('/todos/:id', (req, res) => {
    let id = req.params.id;
    let items = req.session.todos.get(id);
    if (!items) {
        items = new Map();
        req.sessions.todos.set(id, items);
    }
    items.set(req.query.name, req.query.text);
    res.end(200);
});
```

Another way to fix it is to prevent the __proto__ property from being used as a key, as shown below:

```js
let express = require('express');
let app = express()

app.put('/todos/:id', (req, res) => {
    let id = req.params.id;
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
        res.end(403);
        return;
    }
    let items = req.session.todos[id];
    if (!items) {
        items = req.session.todos[id] = {};
    }
    items[req.query.name] = req.query.text;
    res.end(200);
});
```

### References

- MDN: Object.prototype.proto
- MDN: Map
- Common Weakness Enumeration: CWE-78.
- Common Weakness Enumeration: CWE-79.
- Common Weakness Enumeration: CWE-94.
- Common Weakness Enumeration: CWE-400.
- Common Weakness Enumeration: CWE-471.
- Common Weakness Enumeration: CWE-915.