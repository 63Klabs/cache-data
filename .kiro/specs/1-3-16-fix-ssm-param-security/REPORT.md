# Vulnerability Reports

This is for unreleased version v1.3.16.

Now that SSM parameters are fully implemented, let's take a second look at any attack surfaces, since the update was prompted by a similar report [prototype pollution vulnerability](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/REPORT.md) and somewhat addressed during the enhancement of [fully implement SSM Parameter store](../1-3-16-fully-implement-ssm-parameter-store-and-secrets-manager-sdk/)

## Prototype-polluting assignment

src/lib/utils/SecretsManagerLoader.class.js:80

```js
store[group][secretName] = rawValue;
```

src/lib/utils/SecretsManagerLoader.class.js:166

```js
store[group][secretName] = {};
```

src/lib/utils/SecretsManagerLoader.class.js:179

```js
store[group][secretName][key] = String(value);
```

Most JavaScript objects inherit the properties of the built-in Object.prototype object. Prototype pollution is a type of vulnerability in which an attacker is able to modify Object.prototype. Since most objects inherit from the compromised Object.prototype object, the attacker can use this to tamper with the application logic, and often escalate to remote code execution or cross-site scripting.

One way to cause prototype pollution is by modifying an object obtained via a user-controlled property name. Most objects have a special __proto__ property that refers to Object.prototype. An attacker can abuse this special property to trick the application into performing unintended modifications of Object.prototype.
Recommendation

Use an associative data structure that is resilient to untrusted key values, such as a Map. In some cases, a prototype-less object created with Object.create(null) may be preferable.

Alternatively, restrict the computed property name so it can't clash with a built-in property, either by prefixing it with a constant string, or by rejecting inputs that don't conform to the expected format.
Example

In the example below, the untrusted value req.params.id is used as the property name `req.session.todos[id]`. If a malicious user passes in the ID value __proto__, the variable items will then refer to Object.prototype. Finally, the modification of items then allows the attacker to inject arbitrary properties onto Object.prototype.

let express = require('express');
let app = express()

```js
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

## Polynomial regular expression used on uncontrolled data

src/lib/utils/ParameterKeySafety.class.js:115

```js
return path.replace(/\/*$/, '/');
```

Some regular expressions take a long time to match certain input strings to the point where the time it takes to match a string of length n is proportional to nk or even 2n. Such regular expressions can negatively affect performance, or even allow a malicious user to perform a Denial of Service ("DoS") attack by crafting an expensive input string for the regular expression to match.

The regular expression engines provided by many popular JavaScript platforms use backtracking non-deterministic finite automata to implement regular expression matching. While this approach is space-efficient and allows supporting advanced features like capture groups, it is not time-efficient in general. The worst-case time complexity of such an automaton can be polynomial or even exponential, meaning that for strings of a certain shape, increasing the input length by ten characters may make the automaton about 1000 times slower.

Typically, a regular expression is affected by this problem if it contains a repetition of the form r* or r+ where the sub-expression r is ambiguous in the sense that it can match some string in multiple ways. More information about the precise circumstances can be found in the references.
Recommendation

Modify the regular expression to remove the ambiguity, or ensure that the strings matched with the regular expression are short enough that the time-complexity does not matter.
Example

Consider this use of a regular expression, which removes all leading and trailing whitespace in a string:

```js
text.replace(/^\s+|\s+$/g, ''); // BAD
```

The sub-expression "\s+$" will match the whitespace characters in text from left to right, but it can start matching anywhere within a whitespace sequence. This is problematic for strings that do not end with a whitespace character. Such a string will force the regular expression engine to process each whitespace sequence once per whitespace character in the sequence.

This ultimately means that the time cost of trimming a string is quadratic in the length of the string. So a string like "a b" will take milliseconds to process, but a similar string with a million spaces instead of just one will take several minutes.

Avoid this problem by rewriting the regular expression to not contain the ambiguity about when to start matching whitespace sequences. For instance, by using a negative look-behind (/^\s+|(?<!\s)\s+$/g), or just by using the built-in trim method (text.trim()).

Note that the sub-expression "^\s+" is not problematic as the ^ anchor restricts when that sub-expression can start matching, and as the regular expression engine matches from left to right.
Example

As a similar, but slightly subtler problem, consider the regular expression that matches lines with numbers, possibly written using scientific notation:

```js
/^0\.\d+E?\d+$/.test(str) // BAD
```

The problem with this regular expression is in the sub-expression \d+E?\d+ because the second \d+ can start matching digits anywhere after the first match of the first \d+ if there is no E in the input string.

This is problematic for strings that do not end with a digit. Such a string will force the regular expression engine to process each digit sequence once per digit in the sequence, again leading to a quadratic time complexity.

To make the processing faster, the regular expression should be rewritten such that the two \d+ sub-expressions do not have overlapping matches: `^0\.\d+(E\d+)?$`.
Example

Sometimes it is unclear how a regular expression can be rewritten to avoid the problem. In such cases, it often suffices to limit the length of the input string. For instance, the following regular expression is used to match numbers, and on some non-number inputs it can have quadratic time complexity:

```js
/^(\+|-)?(\d+|(\d*\.\d*))?(E|e)?([-+])?(\d+)?$/.test(str) // BAD
```

It is not immediately obvious how to rewrite this regular expression to avoid the problem. However, you can mitigate performance issues by limiting the length to 1000 characters, which will always finish in a reasonable amount of time.

```js
if (str.length > 1000) {
    throw new Error("Input too long");
}

/^(\+|-)?(\d+|(\d*\.\d*))?(E|e)?([-+])?(\d+)?$/.test(str)
```