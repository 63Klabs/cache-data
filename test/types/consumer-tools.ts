/**
 * Consumer compilation test for the tools module.
 * This file exercises type resolution for classes, functions, and variables
 * exported from the tools module. It is compiled with `tsc --noEmit` only.
 *
 * Validates: Requirements 1.2, 2.5, 7.1, 8.1, 8.2
 */

import cacheData = require("@63klabs/cache-data");

// ---------------------------------------------------------------------------
// Access tools module
// ---------------------------------------------------------------------------
const tools = cacheData.tools;

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------
const ver: string = tools.nodeVer;
const major: number = tools.nodeVerMajor;
const minor: number = tools.nodeVerMinor;
const majorMinor: string = tools.nodeVerMajorMinor;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
tools.printMsg();

const sanitized: object = tools.sanitize({ apiKey: "secret123" });
const obfuscated: string = tools.obfuscate("mySecretValue", { keep: 4, char: "*", len: 10 });
const hashed: string = tools.hashThisData("sha256", { name: "test" });
const hashedWithOptions: string = tools.hashThisData("sha256", "data", { salt: "salt", iterations: 2 });

// ---------------------------------------------------------------------------
// AWS class
// ---------------------------------------------------------------------------
const region: string = tools.AWS.REGION;
const sdkVer: "V2" | "V3" = tools.AWS.SDK_VER;
const isV3: boolean = tools.AWS.SDK_V3;
const nodeVersion: string = tools.AWS.NODE_VER;
const nodeMajor: number = tools.AWS.NODE_VER_MAJOR;

// AWS dynamo
const dynamoClient: object = tools.AWS.dynamo.client;
async function testDynamo(): Promise<void> {
	await tools.AWS.dynamo.put({ TableName: "test", Item: {} });
	await tools.AWS.dynamo.get({ TableName: "test", Key: {} });
	await tools.AWS.dynamo.scan({ TableName: "test" });
	await tools.AWS.dynamo.delete({ TableName: "test", Key: {} });
	await tools.AWS.dynamo.update({ TableName: "test", Key: {} });
}

// AWS S3
async function testS3(): Promise<void> {
	await tools.AWS.s3.put({ Bucket: "test", Key: "key", Body: "data" });
	await tools.AWS.s3.get({ Bucket: "test", Key: "key" });
}

// AWS SSM
async function testSsm(): Promise<void> {
	await tools.AWS.ssm.getByName({ Names: ["/app/key"] });
	await tools.AWS.ssm.getByPath({ Path: "/app/" });
}

// AWSXRay
const xray: object | null = tools.AWSXRay;

// ---------------------------------------------------------------------------
// ApiRequest class
// ---------------------------------------------------------------------------
const apiRequest = new tools.ApiRequest({
	host: "api.example.com",
	path: "/users",
	method: "GET",
	parameters: { limit: 10 },
	headers: { "Accept": "application/json" },
	options: { timeout: 5000 },
	pagination: { enabled: true, defaultLimit: 50 },
	retry: { enabled: true, maxRetries: 3 }
});

async function testApiRequest(): Promise<void> {
	const response = await apiRequest.send();
	const success: boolean = response.success;
	const statusCode: number = response.statusCode;
	const headers: Record<string, string> | null = response.headers;
	const body: string | null = response.body;
	const message: string | null = response.message;

	apiRequest.resetRequest();

	const formatted = tools.ApiRequest.responseFormat(true, 200, "OK", {}, "body");
	const formatted2 = tools.ApiRequest.format({ success: true, statusCode: 200 });
	const gatewayResponse = tools.ApiRequest.responseFormatForApiGateway({ statusCode: 200, body: "{}" });
}

// ---------------------------------------------------------------------------
// ImmutableObject class
// ---------------------------------------------------------------------------
const immutable = new tools.ImmutableObject({ key: "value" }, false);
immutable.lock();
immutable.finalize({ key: "newValue" });
const objCopy: any = immutable.toObject();
const valueCopy: any = immutable.get("key");

// ---------------------------------------------------------------------------
// Timer class
// ---------------------------------------------------------------------------
const timer = new tools.Timer("myTimer", true);
const timerName: string = timer.name;
const startTime: number = timer.startTime;

async function testTimer(): Promise<void> {
	await timer.start();
	await timer.updateMessage("running");
	const elapsed: number = timer.elapsed();
	const stopped: number = timer.stop();
	const sinceStart: number = timer.elapsedSinceStart();
	const sinceStop: number = timer.elapsedSinceStop();
	const now: number = timer.now();
	const wasStarted: boolean = timer.wasStarted();
	const notStarted: boolean = timer.notStarted();
	const isRunning: boolean = timer.isRunning();
	const wasStopped: boolean = timer.wasStopped();
	const status: string = timer.status();
	const msg: string = timer.message();
	const details = timer.details(true);
	const detailsName: string = details.name;
}

// ---------------------------------------------------------------------------
// DebugAndLog class
// ---------------------------------------------------------------------------
async function testDebugAndLog(): Promise<void> {
	const level: number = tools.DebugAndLog.getLogLevel();
	tools.DebugAndLog.setLogLevel(3);
	const env: string = tools.DebugAndLog.getEnv();
	const isProd: boolean = tools.DebugAndLog.isProduction();
	const isDev: boolean = tools.DebugAndLog.isDevelopment();
	const isTest: boolean = tools.DebugAndLog.isTest();

	await tools.DebugAndLog.debug("debug message", { data: true });
	await tools.DebugAndLog.diag("diag message");
	await tools.DebugAndLog.msg("msg");
	await tools.DebugAndLog.message("message");
	await tools.DebugAndLog.info("info");
	await tools.DebugAndLog.log("log entry");
	await tools.DebugAndLog.warn("warning");
	await tools.DebugAndLog.warning("warning alias");
	await tools.DebugAndLog.error("error");
	await tools.DebugAndLog.writeLog("CUSTOM", "custom log");
}

// ---------------------------------------------------------------------------
// Connection classes
// ---------------------------------------------------------------------------
const conn = new tools.Connection({
	name: "myApi",
	host: "api.example.com",
	path: "/v1/users",
	method: "GET",
	headers: { "Accept": "application/json" },
	parameters: { limit: "10" },
	cache: [{ profile: "default", defaultExpirationInSeconds: 300 }]
});

const connName: string | null = conn.getName();
const connObj: object = conn.toObject();
const connParams: object | null = conn.getParameters();
const connHeaders: object | null = conn.getHeaders();
const connBody: string | null = conn.getBody();
const cacheProfile: object | undefined = conn.getCacheProfile("default");

const connections = new tools.Connections([
	{ name: "api1", host: "api1.example.com", path: "/v1" },
	conn
]);
connections.add({ name: "api2", host: "api2.example.com", path: "/v2" });
const retrieved: cacheData.tools.Connection | null = connections.get("api1");
const allConns: Record<string, object> = connections.toObject();
const connInfo: Record<string, object> = connections.info();
const connJson: string = connections.toJSON();

// ConnectionRequest
const connReq = new tools.ConnectionRequest({ host: "api.example.com", path: "/data" });
connReq.addHeader("Authorization", "Bearer token");
connReq.addHeaders({ "X-Custom": "value" });
connReq.addParameter("page", 1);
connReq.addParameters({ limit: 10 });

// ConnectionAuthentication
const auth = new tools.ConnectionAuthentication({
	headers: { "x-api-key": "key123" },
	parameters: { token: "abc" },
	basic: { username: "user", password: "pass" }
});
const hasHeader: boolean = auth.hasHeader();
const hasParam: boolean = auth.hasParameter();
const hasBody: boolean = auth.hasBody();
const hasBasic: boolean = auth.hasBasic();
const authObj: object = auth.toObject();

// ---------------------------------------------------------------------------
// RequestInfo class
// ---------------------------------------------------------------------------
const requestInfo = new tools.RequestInfo({});
const isValid: boolean = requestInfo.isValid();
const reqObj: object = requestInfo.toObject(true);
const clientUA: string | null = requestInfo.getClientUserAgent();
const clientIP: string | null = requestInfo.getClientIp();
const clientIPAlias: string | null = requestInfo.getClientIP();
const clientReferrer: string | null = requestInfo.getClientReferrer(false);
const clientOrigin: string | null = requestInfo.getClientOrigin();
const clientHeaders: object = requestInfo.getClientHeaders();
const clientParams: object = requestInfo.getClientParameters();
const clientBody: string | null = requestInfo.getClientBody();

// ---------------------------------------------------------------------------
// ClientRequest class
// ---------------------------------------------------------------------------
tools.ClientRequest.init({
	referrers: ["example.com"],
	parameters: { pathParameters: { id: (value: any) => true } }
});
const clientReq = new tools.ClientRequest({}, {});
const validationReason = clientReq.getValidationReason();
const isValidReq: boolean = validationReason.isValid;
const statusCodeVal: number = validationReason.statusCode;
const messages: string[] = validationReason.messages;
const camelCase: string = tools.ClientRequest.convertHeaderKeyToCamelCase("content-type");

// ---------------------------------------------------------------------------
// ResponseDataModel class
// ---------------------------------------------------------------------------
const dataModel = new tools.ResponseDataModel({ items: [] }, "results");
const label: string = dataModel.getLabel();
dataModel.addItem({ id: 1, name: "test" });
dataModel.addItemByKey({ count: 1 }, "metadata");
const modelObj: any = dataModel.toObject();
const modelStr: string = dataModel.toString();

// ---------------------------------------------------------------------------
// Response class
// ---------------------------------------------------------------------------
const contentTypeJson: string = tools.Response.CONTENT_TYPE.JSON;
const contentTypeHtml: string = tools.Response.CONTENT_TYPE.HTML;

tools.Response.init({
	settings: { errorExpirationInSeconds: 300 },
	jsonResponses: {}
});
const responseInfo = tools.Response.info();
const isInit: boolean = responseInfo.isInitialized;

// ---------------------------------------------------------------------------
// CachedParameterSecret, CachedSsmParameter, CachedSecret
// ---------------------------------------------------------------------------
const ssmParam = new tools.CachedSsmParameter("/myapp/db/password", { refreshAfter: 300 });
const paramName: string = ssmParam.getName();
const paramTag: string = ssmParam.getNameTag();
const paramValid: boolean = ssmParam.isValid();

async function testCachedParams(): Promise<void> {
	await ssmParam.prime();
	const value: string | null = await ssmParam.getValue();
	const syncValue: string = ssmParam.sync_getValue();
}

const secret = new tools.CachedSecret("myapp-api-key");
const secretPath: string = secret.getPath();

// CachedParameterSecrets container
tools.CachedParameterSecrets.add(ssmParam);
tools.CachedParameterSecrets.add(secret);
const names: string[] = tools.CachedParameterSecrets.getNames();
const nameTags: string[] = tools.CachedParameterSecrets.getNameTags();
const retrieved2: cacheData.tools.CachedParameterSecret | undefined = tools.CachedParameterSecrets.get("/myapp/db/password");

async function testPrimeAll(): Promise<void> {
	const success: boolean = await tools.CachedParameterSecrets.prime();
}

// ---------------------------------------------------------------------------
// Generic Response Modules
// ---------------------------------------------------------------------------
const jsonResp = tools.jsonGenericResponse;
const jsonContentType: string = jsonResp.contentType;
const json200 = jsonResp.response200;
const jsonByCode = jsonResp.response(404);
const jsonData: any = jsonResp.json({ key: "value" });

const htmlResp = tools.htmlGenericResponse;
const htmlDoc: string = htmlResp.html("Title", "<p>Body</p>");
const html404 = htmlResp.response(404);

const rssResp = tools.rssGenericResponse;
const rssDoc: string = rssResp.rss("<item>content</item>");

const xmlResp = tools.xmlGenericResponse;
const xmlDoc: string = xmlResp.xml("<data>content</data>");

const textResp = tools.textGenericResponse;
const textDoc: string = textResp.text("Hello World");

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
const connectionObj: cacheData.tools.ConnectionObject = {
	method: "GET",
	uri: "https://api.example.com/data",
	protocol: "https",
	host: "api.example.com",
	path: "/data",
	parameters: { q: "test" },
	headers: { "Accept": "application/json" },
	body: null,
	note: "test connection",
	options: { timeout: 5000 },
	cache: [{ profile: "default", defaultExpirationInSeconds: 60 }]
};

const cacheProfileObj: cacheData.tools.CacheProfileObject = {
	profile: "default",
	overrideOriginHeaderExpiration: true,
	defaultExpirationInSeconds: 300,
	expirationIsOnInterval: false,
	headersToRetain: ["content-type", "etag"],
	hostId: "api.example.com",
	pathId: "/data",
	encrypt: false,
	defaultExpirationExtensionOnErrorInSeconds: 60
};

const initOptions: cacheData.tools.AppConfigInitOptions = {
	settings: { dataLimit: 1000 },
	connections: {},
	validations: {},
	responses: {
		settings: {
			errorExpirationInSeconds: 300,
			routeExpirationInSeconds: 600,
			externalRequestHeadroomInMs: 1000
		},
		jsonResponses: {},
		htmlResponses: {}
	},
	ssmParameters: {},
	debug: true
};

// ---------------------------------------------------------------------------
// Deprecated Aliases (type-level only)
// ---------------------------------------------------------------------------
type AwsAlias = cacheData.tools.Aws;
type AwsXRayAlias = cacheData.tools.AwsXRay;
type APIRequestAlias = cacheData.tools.APIRequest;
type ConfigSuperClassAlias = cacheData.tools._ConfigSuperClass;
type CachedSSMParameterAlias = cacheData.tools.CachedSSMParameter;
