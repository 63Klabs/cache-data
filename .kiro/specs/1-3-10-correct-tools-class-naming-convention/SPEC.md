# Correct Tools Class Naming Convention

Some classes with acronyms in their names have the acronyms in all upper case. Such as APIRequest, and CachedSSMParameter. (We will leave AWS and AWSXRay alone)

These need to become ApiRequest and CachedSsmParameter respectively.

An alias has already been created for each in the classes exports.

We now need to make the old name the alias and rename the Class and references to it using the proper naming convention.

For example:

```js
class CachedSSMParameter {
    // code
}

module.exports = {
    CachedSSMParameter, 
    CachedSsmParameter: CachedSSMParameter // alias
};
```

Needs to become:

```js
class CachedSsmParameter {
    // code
}

module.exports = {
    CachedSsmParameter, 
    CachedSSMParameter: CachedSsmParameter // alias
};
```

Also, APIRequest.class.js needs to be renamed ApiRequest.class.js but still retain APIRequest.class.js for backward compatibility. APIRequest.class.js should just import and export the ApiRequest class (along with the APIRequest alias.)

Maintaining backwards compatibility is of utmost importance. All current tests should pass. Current tests should only be updated at the end of the process.

Documentation should reference the new names if it doesn't already.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
