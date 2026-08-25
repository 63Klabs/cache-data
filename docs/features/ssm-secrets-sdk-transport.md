# SSM Parameter Store and Secrets Manager: Transport Selection

This document covers the two transports for retrieving SSM parameters and Secrets Manager secrets, how the package selects between them, and the IAM permissions each requires.

## Two transports

| | Lambda Extension (Layer) | AWS SDK |
|---|---|---|
| Transport | HTTP `localhost:2773` | AWS SDK v3 clients |
| Requires | `AWS-Parameters-and-Secrets-Lambda-Extension` layer in your SAM/CloudFormation template | Lambda execution role with appropriate IAM permissions |
| Cold start | Fastest — layer provides local caching | Slightly slower — SDK call on cold start |
| Caching | Layer caches for 5 minutes (plus `refreshAfter` in code) | In-process only, `refreshAfter` default 300 s |
| Automatic | Selected when `AWS_SESSION_TOKEN` is present | Selected when layer is absent or overridden |

Both transports decrypt `SecureString` parameters and return the same string value. `getValue()` returns an identical result regardless of which transport served the request.

## Detection and selection

The package determines transport once per Lambda container lifetime:

1. **Explicit override** — call `CachedParameterSecrets.init()` with an override option, or call `ExtensionAvailability.setOverride(true|false)` directly. Takes precedence over everything else.
2. **Environment heuristic** — if `AWS_SESSION_TOKEN` is absent or empty the layer cannot work (it requires the session token as a request header), so the SDK is selected immediately without attempting a connection.
3. **Probe on first use** — if the heuristic is inconclusive (token is present), the package attempts the layer on the first retrieval. A `ECONNREFUSED` or timeout marks the layer unavailable and falls back to SDK in the same call. A non-2xx response marks the layer *available* and does not fall back (see below).

> **Note on non-2xx responses**: if the extension returns a 4xx or 5xx the package treats it as "layer present, request failed" and does NOT switch to SDK. Silent transport switching on an auth failure or missing-parameter error would mask a deployment misconfiguration and double latency. Use the explicit override if you want SDK despite a broken extension token.

After the first determination, transport is fixed for the container lifetime. No re-probing occurs.

## Configuration via AppConfig.init()

```javascript
const { Config } = require('./config');

// SSM parameters — loaded at init time, accessible via Config.parameters() after promise() settles
Config.init({
  ssmParameters: [
    // Named parameters — specific names beneath a path
    {
      group: 'app',
      path: process.env.PARAM_STORE_PATH,   // e.g. '/myapp/prod/'
      names: ['authUsername', 'authPassword', 'crypt_secureDataKey']
    },
    // Path discovery — retrieve all parameters beneath a path
    {
      group: 'db',
      path: '/myapp/db/',
      recursive: false                        // set true for nested hierarchies
    }
  ],
  secrets: [
    // Raw string storage (default)
    { group: 'certs', names: ['myapp/tls/certificate'] },
    // JSON parsing — parsed keys nested under secret name
    { group: 'db', names: ['myapp/db/credentials'], parseJson: true }
  ]
});

await Config.promise();

// Read parameters and secrets after promise() settles
const username = Config.parameters()?.app?.authUsername;
const dbPassword = Config.secrets()?.db?.['myapp/db/credentials']?.password;
```

## Configuration via CachedParameterSecrets

```javascript
const { CachedParameterSecrets } = require('@63klabs/cache-data').tools;

// At module scope or in handler init
const initPromise = CachedParameterSecrets.init({
  ssmParameters: [
    { group: 'app', path: '/myapp/prod/', names: ['authKey'] }
  ],
  secrets: [
    { group: 'api', names: ['myapp/external-api/credentials'] }
  ]
});

// Register with AppConfig so promise() gates on it
Config.add(initPromise);

// At runtime
const param = CachedParameterSecrets.get('/myapp/prod/authKey');
const value = await param.getValue();

// Or still construct individual instances
const apiSecret = new CachedSecret('myapp/external-api/key');
await apiSecret.prime();
const key = apiSecret.sync_getValue();
```

## Recursive path queries

Set `recursive: true` on a path entry to retrieve parameters from nested hierarchies:

```javascript
const entry = {
  group: 'app',
  path: '/myapp/',
  recursive: true
};
```

> **Security note**: AWS grants transitive read access under recursive path queries. A principal permitted on `/myapp/` can read `/myapp/db/password` even when IAM explicitly denies that specific parameter. Default is `false` for this reason — opt in deliberately.

The returned parameters are stored using the path segments below the configured prefix. For example, `/myapp/db/host` under `/myapp/` recursive becomes `store.app.db.host`.

## Removing the Lambda layer

If you want to drop the `AWS-Parameters-and-Secrets-Lambda-Extension` layer from your template, no application code change is required. The SDK path becomes active automatically. You will need to:

1. Remove the layer ARN from your SAM/CloudFormation template.
2. Add the IAM permissions listed below to your Lambda execution role.
3. Note that `GetParametersByPath` is always called for path-based configuration regardless of transport (the extension has no list endpoint), so that permission was already required if you use path entries.

## IAM permissions required by the SDK transport

```json
{
  "Effect": "Allow",
  "Action": [
    "ssm:GetParameters",
    "ssm:GetParametersByPath"
  ],
  "Resource": [
    "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/myapp/*"
  ]
},
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue"
  ],
  "Resource": [
    "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:myapp/*"
  ]
},
{
  "Effect": "Allow",
  "Action": [
    "kms:Decrypt"
  ],
  "Resource": [
    "arn:aws:kms:REGION:ACCOUNT_ID:key/YOUR_KMS_KEY_ID"
  ]
}
```

`ssm:GetParameters` is needed when you enumerate names (the `names` array). `ssm:GetParametersByPath` is needed when you use path entries (no `names` array) or when you call `CachedParameterSecrets.init()` with path entries. `kms:Decrypt` is only required for `SecureString` SSM parameters or secrets managed by a customer-managed KMS key.

## Diagnosing transport issues

```javascript
const info = CachedParameterSecrets.info();
console.log(info.availability.state);   // 'available' | 'unavailable' | 'unknown'
console.log(info.availability.transport); // 'layer' | 'sdk'
console.log(info.availability.reason);   // 'connection-refused' | 'no-session-token' | etc.
console.log(info.counts.total);          // number of registered parameters/secrets
```

## Known limitations

- **Binary secrets** (`SecretBinary` without `SecretString`) are not supported by either transport. They are reported in warnings and skipped.
- **Secret names containing `/`** (e.g. `myapp/db/credentials`) are stored verbatim as a single key, not split on `/`. Parsed JSON keys from such secrets are fully validated.
- **`ssm:GetParametersByPath` is always required** for path-based configuration, even when using the Lambda extension, because the extension has no list endpoint.

## Related documentation

- [Quick Start Guide](../00-quick-start-implementation/)
- [Lambda optimization](../lambda-optimization/)
