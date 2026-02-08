# Fully Implement Timezone

Fully implement a method that replaces the `moment-timezone` npm package.

The classes in dao-cache rely on time calculations which include a function in `moment-timezone` to determine the timezone if cache expiration occurs outside of 60 minutes. (to determine midnight, even hours, every 4 hours, etc).

Since this is the only use of `moment-timezone` it would make sense to consolidate and take it internal to cache-data.

Cache Data currently uses 2 outside packages in a very limited capacity, it would make sense to move this functionality internally as it reduces the reliance on externally managed packages and will provide a leaner code-base since not all functionality from these packages are utilized. This would replace one of those packages `moment-timezone`.

Similar to the implementation of the src/lib/utils/InMemoryCache.js we will implement a new class in src/lib/utils called `TimeUtils`.

The following methods should be moved to the new `TimeUtils` class and the current classes in dao-cache should reference the new implementation:

- CacheData.generateInternetFormattedDate
- CacheData.convertTimestampFromSecondsToMilli
- CacheData.convertTimestampFromMilliToSeconds
- CacheData.nextIntervalInSeconds
- CacheData.getOffsetInMinutes
- CacheData._setOffsetInMinutes

`TimeUtils` will be static and require an init similar to InMemoryCache which can be called upon init of CacheData. `TimeUtils.init` will take one optional parameter, timezone. If it is blank it defaults to an environment variable or UTC.

The current logic in CacheData.init for CACHE_DATA_TIME_ZONE_FOR_INTERVAL can move to `TimeUtils` for setting the timezone.

```js
// CacheData init():

	// ...
	TimeUtils.init( {timezone: parameters?.timeZoneForInterval});
	// ...
```

CacheData should no longer validate the timezone. However, it should receive and handle an invalid timezone error thrown by TimeUtils due to an invalid timezone (if Date throws such an error, as we will not validate all of the timezones ourself)


```js
// TimeUtils init( options ):

	// ...
	// Check timezone in options (of type string)
	// Check for valid timezone in process.env.CACHE_DATA_TIME_ZONE_FOR_INTERVAL (of type string)
	// else use "Etc/UTC" as default (null, empty, undefined)
	// check to see if it is valid by trying to use a Date function and catch any thrown errors, generating our own error to throw.
```

Now that the above methods are publicly available through the `TimeUtils` API they should be able to be tested using the code in Cache.testInterval

Tests should still pass.

`moment-timezone` should be removed from the dependencies.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
