# Test Migration Phase 4

Any tests written in Mocha for CachedParametersSecrets.classes, Connections.classes, DebugAndLog.class, and Timer.class should be migrated to the Jest framework.

Any test area that are lacking in these modules should be generated so that it is fully tested.

Care should be taken to not introduce any breaking changes.

After migration the Mocha test should be retained and continue to be used in the test suite until all tests have been migrated. This will ensure there is no descripency between the two tests during the entirety of the migration.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.
