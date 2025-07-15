const isTrue = (value) => {
	return (value !== null && typeof value !== 'undefined' && 
		(value === true || value === 1 || value === "1" || 
		(typeof value === 'string' && value.toLowerCase() === "true")));
};

const AWSXRay = (isTrue(process.env?.CacheData_AWSXRayOn) || isTrue(process.env?.CACHE_DATA_AWS_X_RAY_ON) ) ? require("aws-xray-sdk-core") : null;

if (AWSXRay !== null) {
	// Configure capture options
	const captureOptions = {
		captureRequestInit: true,  // Capture request init
		captureResponse: true,     // Capture response
		generateUniqueId: true     // Generate unique IDs for each request
	};

	AWSXRay.captureHTTPsGlobal(require('http'), captureOptions);
	AWSXRay.captureHTTPsGlobal(require("https"), captureOptions);	
}

/**
 * AWS Helper Functions - Functions to perform common get and put operations for DynamoDB, S3, and SSM parameter store.
 * Uses AWS SDK v2 or v3 depending on the Node.js version. It will perform this check for you and utilize the proper SDK.
 * 
 * @example
 * console.log(AWS.REGION); // outputs the region set in Node environment: process.env.AWS_REGION
 * 
 * @example
 * const result = await AWS.dynamo.get(params);
 * const response = await AWS.dynamo.put(params);
 * AWS.dynamo.client; // access the DynamoDb Document client directly
 * AWS.dynamo.sdk; // access the DynamoDB SDK (V2: { DynamoDB }, V3: { DynamoDB, DynamoDBClient, GetItemCommand, PutItemCommand }
 * const dbDocClient = new AWS.dynamo.sdk.DynamoDB.DocumentClient( {region: AWS.REGION} );
 * 
 * @example
 * result = await AWS.s3.get(params);
 * response = await AWS.s3.put(params);
 * AWS.s3.client; // access the S3 client directly
 * 
 * @example
 * ssmParams1 = await AWS.ssm.getByName(query);
 * ssmParams2 = await AWS.ssm.getByPath(query);
 * AWS.ssm.client; // access the SSM Client
 * AWS.ssm.sdk; // access the SSM SDK (V3 contains { SSM, SSMClient, GetParameterCommand, PutParameterCommand })
 * 
 * @class AWS
 * @property {string} NODE_VER
 * @property {number} NODE_VER_MAJOR
 * @property {number} NODE_VER_MINOR
 * @property {number} NODE_VER_PATCH
 * @property {string} NODE_VER_MAJOR_MINOR
 * @property {string} SDK_VER 'V2' or 'V3'
 * @property {boolean} SDK_V2 true if using AWS SDK v2
 * @property {boolean} SDK_V3 true if using AWS SDK v3
 * @property {string} REGION AWS region grabbed from Node process.env.AWS_REGION. If not set uses 'us-east-1'
 * @property {object} dynamo
 * @property {object} dynamo.client DynamoDb Document client (either V2 or V3)
 * @property {object} dynamo.sdk V2: { DynamoDb }, V3: { DynamoDB, DynamoDBClient, DynamoDBDocumentClient, GetCommand, PutCommand }
 * @property {object} dynamo.put function(params) Given a DynamoDb param object, uses the correct SDK version to perform a DynamoDb put command
 * @property {object} dynamo.get function(params) Given a DynamoDb param object, uses the correct SDK version to perform a DynamoDb get command
 * @property {object} dynamo.scan function(params) Given a DynamoDb param object, uses the correct SDK version to perform a DynamoDb scan command
 * @property {object} dynamo.delete function(params) Given a DynamoDb param object, uses the correct SDK version to perform a DynamoDb delete command
 * @property {object} dynamo.update function(params) Given a DynamoDb param object, uses the correct SDK version to perform a DynamoDb update command
 * @property {object} s3
 * @property {object} s3.client S3 client (either V2 or V3)
 * @property {object} s3.sdk V2: { S3 }, V3: { S3Client, GetObjectCommand, PutObjectCommand }
 * @property {object} s3.put function(params) Given an S3 param object, uses the correct SDK version to perform a S3 put command
 * @property {object} s3.get function(params) Given an S3 param object, uses the correct SDK version to perform a S3 get command
 * @property {object} ssm
 * @property {object} ssm.client SSM client (either V2 or V3)
 * @property {object} ssm.sdk V2: { SSM }, V3: { SSMClient, GetParameterCommand, GetParametersByPathCommand }
 * @property {object} ssm.getByName function(query) Given SSM Parameter Store query, uses the correct SDK version to perform the getParameters command
 * @property {object} ssm.getByPath function(query) Given SSM Parameter Store query, uses the correct SDK version to perform the getParametersByPath command
 * @property {object} AWSXRay
 */
class AWS {

	static #nodeVer = [];
	static #aws_region = null;

	static #XRayOn = (AWSXRay !== null);

	constructor() {}

	static get nodeVersionArray() {
		if (this.#nodeVer.length === 0) {
			// split this.NODE_VER into an array of integers
			this.#nodeVer = this.NODE_VER.split(".").map( (x) => parseInt(x, 10) );
		}
		return this.#nodeVer;
	};

	static get region() {
		if (this.#aws_region === null) {

			const hasRegion = (
				"AWS_REGION" in process.env 
				&& typeof process.env.AWS_REGION !== 'undefined' 
				&& process.env.AWS_REGION !== null 
				&& process.env.AWS_REGION !== ""
			);

			if (!hasRegion) {
				console.warn("AWS_REGION is NOT set in Lambda Node environment variables. Trying 'us-east-1'. To prevent unexpected results, please create and set the 'AWS_REGION' in your Lambda environment variables.");
			}

			this.#aws_region = ( hasRegion ? process.env.AWS_REGION : "us-east-1" );
		}

		return this.#aws_region;
	}

	static get NODE_VER() { return ( ("versions" in process && "node" in process.versions) ? process.versions.node : "0.0.0"); }
	static get NODE_VER_MAJOR() { return ( this.nodeVersionArray[0] ); }
	static get NODE_VER_MINOR() { return ( this.nodeVersionArray[1] ); }
	static get NODE_VER_PATCH() { return ( this.nodeVersionArray[2] ); }
	static get NODE_VER_MAJOR_MINOR() { return (this.nodeVersionArray[0] + "." + this.nodeVersionArray[1]); }
	static get NODE_VER_ARRAY() { return (this.nodeVersionArray); }
	static get SDK_VER() { return ((this.NODE_VER_MAJOR < 18) ? "V2" : "V3"); }
	static get REGION() { return ( this.region ); }
	static get SDK_V2() { return (this.SDK_VER === "V2"); }
	static get SDK_V3() { return (this.SDK_VER === "V3"); }

	static get INFO() { 
		return ( {
			NODE_VER: this.NODE_VER,
			NODE_VER_MAJOR: this.NODE_VER_MAJOR,
			NODE_VER_MINOR: this.NODE_VER_MINOR,
			NODE_VER_PATCH: this.NODE_VER_PATCH,
			NODE_VER_MAJOR_MINOR: this.NODE_VER_MAJOR_MINOR,
			NODE_VER_ARRAY: this.NODE_VER_ARRAY,
			SDK_VER: this.SDK_VER,
			REGION: this.REGION,
			SDK_V2: this.SDK_V2,
			SDK_V3: this.SDK_V3,
			AWSXRayOn: this.#XRayOn
		});
	}

	static #SDK = (
		function(){
			if (AWS.SDK_V2) {
				const { DynamoDB, S3, SSM } = (this.#XRayOn) ? AWSXRay.captureAWS(require("aws-sdk")) : require("aws-sdk");
				return {
					dynamo: {
						client: (new DynamoDB.DocumentClient( {region: AWS.REGION} )), 
						put: (client, params) => client.put(params).promise(),
						get: (client, params) => client.get(params).promise(),
						scan: (client, params) => client.scan(params).promise(),
						delete: (client, params) => client.delete(params).promise(),
						update: (client, params) => client.update(params).promise(),
						sdk: { DynamoDB }
					},
					s3: {
						client: (new S3()),
						put: (client, params) => client.putObject(params).promise(),
						get: (client, params) => client.getObject(params).promise(),
						sdk: { S3 }
					},
					ssm: {
						client: (new SSM( {region: AWS.REGION} )),
						getByName: (client, params) => client.getParameters(params).promise(),
						getByPath: (client, params) => client.getParametersByPath(params).promise(),
						sdk: { SSM }
					}
				}
			} else {
				const { DynamoDBClient} = require("@aws-sdk/client-dynamodb");
				const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
				const { S3, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
				const { SSMClient, GetParametersByPathCommand, GetParametersCommand } = require("@aws-sdk/client-ssm");

				return {
					dynamo: {
						client: (DynamoDBDocumentClient.from(
							(AWS.#XRayOn) ? AWSXRay.captureAWSv3Client(new DynamoDBClient({ region: AWS.REGION }))
							: new DynamoDBClient({ region: AWS.REGION })) ),
						put: (client, params) => client.send(new PutCommand(params)),
						get: (client, params) => client.send(new GetCommand(params)),
						scan: (client, params) => client.send(new ScanCommand(params)),
						delete: (client, params) => client.send(new DeleteCommand(params)),
						update: (client, params) => client.send(new UpdateCommand(params)),
						sdk: {
							DynamoDBClient,
							DynamoDBDocumentClient,
							GetCommand,
							PutCommand
						}	
					},
					s3: {
						client: (
							(AWS.#XRayOn) ? AWSXRay.captureAWSv3Client(new S3())
							: new S3()),
						put: (client, params) => client.send(new PutObjectCommand(params)),
						get: (client, params) => client.send(new GetObjectCommand(params)),
						sdk: {
							S3,
							GetObjectCommand,
							PutObjectCommand							
						}

					},
					ssm: {
						client: (
							(AWS.#XRayOn) ? AWSXRay.captureAWSv3Client(new SSMClient({ region: AWS.REGION }))
							: new SSMClient({ region: AWS.REGION })),
						getByName: (client, query) => client.send(new GetParametersCommand(query)),
						getByPath: (client, query) => client.send(new GetParametersByPathCommand(query)),
						sdk: {
							SSMClient,
							GetParametersByPathCommand,
							GetParametersCommand
						}
					}
				}			
			}
		}
	)();
	
	static get dynamo() {
		return {
			client: this.#SDK.dynamo.client,
			put: ( params ) => this.#SDK.dynamo.put(this.#SDK.dynamo.client, params),
			get: ( params ) => this.#SDK.dynamo.get(this.#SDK.dynamo.client, params),
			scan: ( params ) => this.#SDK.dynamo.scan(this.#SDK.dynamo.client, params),
			delete: ( params ) => this.#SDK.dynamo.delete(this.#SDK.dynamo.client, params),
			update: ( params ) => this.#SDK.dynamo.update(this.#SDK.dynamo.client, params),
			sdk: this.#SDK.dynamo.sdk
		};
	}

	static get s3() {
		return {
			client: this.#SDK.s3.client,
			put: ( params ) => this.#SDK.s3.put(this.#SDK.s3.client, params),
			get: ( params ) => this.#SDK.s3.get(this.#SDK.s3.client, params),
			sdk: this.#SDK.s3.sdk
		};
	}

	static get ssm() {
		return {
			client: this.#SDK.ssm.client,
			getByName: ( query ) => this.#SDK.ssm.getByName(this.#SDK.ssm.client, query),
			getByPath: ( query ) => this.#SDK.ssm.getByPath(this.#SDK.ssm.client, query),
			sdk: this.#SDK.ssm.sdk
		};
	}

	static get XRay() {
		return AWSXRay;
	}

};

module.exports = {AWS, AWSXRay};