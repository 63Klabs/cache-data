# ClientRequest Update: Forwarded For

This update is for the tools.ClientRequest class. Since the fix will produce expected behavior, backwards compatibility is not required. This will be considered a bug fix.

When the API Gateway is put behind CloudFront, the ClientIp returns the IP of CloudFront and not the original client.

Use X-Forwarded-For header first.

When X-Forwarded-For header contains multiple comma-separated IPs THEN the system SHALL extract only the first IP address (the original client) and use that as the ClientIp.

It is also noted that the User Agent is currently being returned as CloudFront, that too will need to be updated to ensure the original user agent is being used.

Ask any clarifying questions in SPEC-QUESTIONS.md and the user will answer them there. All questions must be answered before moving on to the spec driven workflow.
