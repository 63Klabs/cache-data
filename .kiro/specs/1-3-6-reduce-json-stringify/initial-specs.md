# Reduce the number of times JSON stringify and JSON parse are used

JSON.stringify and JSON.parse are expensive operations, and we are doing them a lot. We should reduce the number of times we do them.

Identify where they are being used, what they are being used for, and if they are essential. They may be used when a simple clone is needed. 

When certain operations are chained together they may be used multiple times in a chain parse -> stringify -> parse -> stringify etc. Identify where this might be happening.