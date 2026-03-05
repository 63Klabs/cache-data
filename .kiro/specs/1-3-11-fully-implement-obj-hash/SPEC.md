# Fully Implement Object Hash

Fully implement a method that replaces the `object-hash` npm package.

The replacement method `hashThisData` has been available internally from the tools utils for a while now.

Cache Data currently uses 2 outside packages in a very limited capacity, it would make sense to move this functionality internally as it reduces the reliance on externally managed packages and will provide a leaner code-base since not all functionality from these packages are utilized. This would replace one of those packages `object-hash`.

Object Hashing is used to provide caches with unique keys based on the properties and values contained within an object that is passed to it.

There is currently a feature switch that is default to false, when setting Cache.init() called `useToolsHash` or the environment variable `CACHE_DATA_USE_TOOLS_HASH`. These should no longer be checked for during Cache.init and only the tools hash `hashThisData` should be used.

The `hashThisData` method should be migrated to a new class `DataHasher` with the static method `hash` and stored in src/lib/utils similar to InMemoryCache.

Documentation should be updated to include information about the environment variable `CACHE_DATA_USE_TOOLS_HASH` and Cache.init parameter `useToolsHash` are no longer used.

Tests should still pass.

It needs to be determined if the `hashThisData` method respects the order of arrays passed to it and must determine that `['apple', 'orange']` is NOT the same as `['orange', 'apple']`. Property order should be alphabetical, such that `{headers: {a: 1}, parameters: {b: 2}}` IS the same as `{parameters: {b: 2}, headers: {a: 1}}` If that is not the case then `hashThisData` needs to be updated.

`object-hash` should be removed as a dependency.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
