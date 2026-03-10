# Correct Tools Class Naming Convention

Some classes with acronyms in their names have the acronyms in all upper case. Such as ApiRequest, AWS, AWSXRay, and CachedSsmParameter.

These need to become ApiRequest, Aws, AwsXRay, and CachedSsmParameter respectively.

An alias has already been created for the old to new in the classes exports.

We now need to make rename the Class and references to it using the proper naming convention and switch the alias so that the alias becomes the old name.

For example:

```js
class CachedSsmParameter {
    // code
}

module.exports = {
    CachedSsmParameter, 
    CachedSsmParameter: CachedSsmParameter // alias
};
```

Needs to become:

```js
class CachedSsmParameter {
    // code
}

module.exports = {
    CachedSsmParameter, 
    CachedSsmParameter: CachedSsmParameter // alias
};
```

Also, ApiRequest.class.js needs to be renamed ApiRequest.class.js but still retain ApiRequest.class.js for backward compatibility. ApiRequest.class.js should just import and export the ApiRequest class (along with the ApiRequest alias.) Same with Aws.classes.js

Maintaining backwards compatibility is of utmost importance. All current tests should pass. Current tests should only be updated at the end of the process.

Documentation should reference the new names if it doesn't already.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
