import { expect } from 'chai';

import sinon from 'sinon';

import { ApiRequest, Connection, ConnectionAuthentication } from '../../src/lib/tools/index.js';

describe("Call test endpoint", () => {

	describe('Call test endpoint using tools ApiRequest class', () => {
		
		it('Passing uri results in success with a hidden game listed', async () => {
			let req = new ApiRequest({uri: 'https://api.chadkluck.net/games/'})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			
			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.hiddengames.length).to.equal(1);
			expect(obj.hiddengames[0]).to.equal("Tic-Tac-Toe")
		});		

		it('Passing host and path results in success with a hidden game listed', async () => {
			let req = new ApiRequest({host: 'api.chadkluck.net', path: '/games/'})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.hiddengames.length).to.equal(1);
			expect(obj.hiddengames[0]).to.equal("Tic-Tac-Toe")
		})

		it('Headers were passed along', async () => {

			let headers = {
				Authorization: "Basic somerandomExampleKey",
				//'if-none-match': "528cd81ca4",
				//'if-modified-since': "Mon, 14 Feb 2022 03:44:00 GMT",
				'x-my-custom-header': "hello world",
				'User-Agent': "My User Agent"
			};
			let req = new ApiRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: {}
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.requestInfo.headers.Authorization).to.equal(headers.Authorization)
			//&& expect(obj.requestInfo.headers['if-none-match']).to.equal(headers['if-none-match'])
			//&& expect(obj.requestInfo.headers['if-modified-since']).to.equal(headers['if-modified-since']);
			expect(obj.requestInfo.headers['x-my-custom-header']).to.equal(headers['x-my-custom-header']);
			expect(obj.requestInfo.userAgent).to.equal(headers['User-Agent'])
		});


		it('Parameters were passed along and duplicates were combined into CSV', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello",
				param2: "world",
				param3: ["hi","earth"],
				searchParam: "everything",
				keywords: "international+greetings"
			}

			let req = new ApiRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.requestInfo.parameters.param1).to.equal(parameters.param1);
			expect(obj.requestInfo.parameters.param2).to.equal(parameters.param2);
			expect(obj.requestInfo.parameters.param3).to.equal(parameters.param3.join(','))
		});

		
		it('Parameters were passed along and duplicates were separate', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello",
				param2: "world",
				param3: ["hi","earth"],
				searchParam: "everything",
				keywords: "international+greetings"
			}

			let req = new ApiRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters,
				options: {separateDuplicateParameters: true, separateDuplicateParametersAppendToKey: "0++"}
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.requestInfo.parameters.param1).to.equal(parameters.param1);
			expect(obj.requestInfo.parameters.param2).to.equal(parameters.param2);
			expect(obj.requestInfo.parameters.param30).to.equal(parameters.param3[0]);
			expect(obj.requestInfo.parameters.param31).to.equal(parameters.param3[1]);
		});
		
		it('Body was passed along in a POST request', async () => {

			let headers = {
				'x-my-custom-header': "hello world",
				'Content-Type': "text/plain",
				'User-Agent': "My User Agent"
			};

			let parameters = {
				param1: "hello"
			};

			let body = "Hello, Earth!";

			let req = new ApiRequest({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: body,
				parameters: parameters
			})
			const result = await req.send()

			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(result.body).to.equal('"'+body+'"')
		});

		it('GET request', async () => {

			let headers = {
				'x-my-custom-header': "hello world"
			};

			let parameters = {
				param1: "hello"
			}

			let req = new ApiRequest({
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: headers,
				uri: "",
				protocol: "https",
				body: null,
				parameters: parameters
			})
			const result = await req.send()
			const obj = JSON.parse(result.body);

			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.requestInfo.method).to.equal("GET")
		});

		it('Passing host and path and an empty uri results in success with a hidden game listed', async () => {
			let req = new ApiRequest({host: 'api.chadkluck.net', path: '/games/', uri: ''})
			const result = await req.send()
			const obj = JSON.parse(result.body);
			expect(result.statusCode).to.equal(200);
			expect(result.success).to.equal(true);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("SUCCESS");
			expect(obj.hiddengames.length).to.equal(1);
			expect(obj.hiddengames[0]).to.equal("Tic-Tac-Toe")
		})

		it('Passing uri results in 404', async () => {
			let req = new ApiRequest({uri: 'https://api.chadkluck.net/echo/?status=404'})
			const result = await req.send()
			expect(result.statusCode).to.equal(404);
			expect(result.success).to.equal(false);
			expect((typeof result.headers)).to.equal('object');
			expect(result.message).to.equal("FAIL")
		})

		it('Passing uri results in no redirect', async () => {
			let req = new ApiRequest({uri: 'https://api.chadkluck.net/games/'})
			const result = await req.send()
			expect(result.statusCode).to.equal(200);
			expect(req.toObject().redirects.length).to.equal(0)
		})

	})

	describe ('Test ConnectionAuthentication class', () => {

		it('ConnectionAuthentication Basic' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({basic: {username: "snoopy", password: "W00dstock1966"}}),
				body: null,
				})
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers.Authorization).to.equal("Basic c25vb3B5OlcwMGRzdG9jazE5NjY=");
			expect(obj.headers.Authorization).to.equal("Basic c25vb3B5OlcwMGRzdG9jazE5NjY=");
		})

		it('ConnectionAuthentication Parameters' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({parameters: {apikey: "myExampleApiKeyForResource1234"}}),
				body: null,
			})
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.parameters.apikey).to.equal("myExampleApiKeyForResource1234");
			expect(obj.parameters.apikey).to.equal("myExampleApiKeyForResource1234");
		})

		it('ConnectionAuthentication Parameters with Existing Parameters', async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				parameters: {empId: "B8472881993", format: "full"},
				authentication: new ConnectionAuthentication({parameters: {apikey: "myExampleApiKeyForResource5678"}}),
				body: null,
			})

			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.parameters.apikey).to.equal("myExampleApiKeyForResource5678");
			expect(obj.parameters.apikey).to.equal("myExampleApiKeyForResource5678");
			expect(obj.parameters.empId).to.equal("B8472881993");
			expect(obj.parameters.format).to.equal("full");
		})

		it('ConnectionAuthentication Headers' , async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({headers: {'x-apikey': "myExampleApiKeyForResource1234"}}),
				body: null,
			});
			
			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers['x-apikey']).to.equal("myExampleApiKeyForResource1234");
			expect(obj.headers['x-apikey']).to.equal("myExampleApiKeyForResource1234");
		});

		it('ConnectionAuthentication Headers with Existing Headers', async () => {
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				headers: {'x-empid': "B8472881993", 'x-format': "full"},
				authentication: new ConnectionAuthentication({headers: {'x-apikey': "myExampleApiKeyForResource5678"}}),
				body: null,
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));

			expect(obj.authentication.headers['x-apikey']).to.equal("myExampleApiKeyForResource5678");
			expect(obj.headers['x-apikey']).to.equal("myExampleApiKeyForResource5678");
			expect(obj.headers['x-empid']).to.equal("B8472881993");
			expect(obj.headers['x-format']).to.equal("full");
		});

		it('ConnectionAuthentication Body', async () => {
			let bodyValue = {apikey: "myExampleApiKeyForResource1234"};
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				authentication: new ConnectionAuthentication({body: bodyValue}),
				body: null,
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));
			let body = obj.body;
			try {
				body = JSON.parse(obj.body);
			} catch (error) {
				// nothing
			}

			expect(obj.authentication.body.apikey).to.equal("myExampleApiKeyForResource1234");
			expect(obj.body).to.equal(JSON.stringify(bodyValue));
			expect(body.apikey).to.equal("myExampleApiKeyForResource1234");
		})

		it('ConnectionAuthentication Body with Existing Body', async () => {
			let bodyValue = {empId: "B8472881993", format: "full"};
			let conn = new Connection({
				method: "POST",
				host: "api.chadkluck.net",
				path: "/echo/",
				protocol: "https",
				body: bodyValue,
				authentication: new ConnectionAuthentication({body: {apikey: "myExampleApiKeyForResource5678"}}),
			});

			const obj = JSON.parse(JSON.stringify(conn.toObject()));
			let body = obj.body;
			try {
				body = JSON.parse(obj.body);
			} catch (error) {
				// nothing
			}

			expect(obj.authentication.body.apikey).to.equal("myExampleApiKeyForResource5678");
			expect(obj.body).to.equal(JSON.stringify({apikey: "myExampleApiKeyForResource5678"}));
			expect(body.apikey).to.equal("myExampleApiKeyForResource5678");
		})

	})


	describe('Test ApiRequest class', () => {

		it('Testing setter and getter functions of ApiRequest without sending', async () => {
			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: { "My-Custom-Header": "my custom header value"},
				uri: "",
				protocol: "https",
				body: null,
				parameters: {q: "prime+numbers", limit: "5"},
				options: { timeout: 2000}
			};

			let req = new ApiRequest(obj);

			expect(req.getMethod()).to.equal(obj.method);
			expect(req.getBody()).to.equal(obj.body);
			expect(req.getTimeOutInMilliseconds()).to.equal(obj.options.timeout)
		});


		it('Testing min value of timeOutInMilliseconds', () => {

			let obj = {
				method: "GET",
				host: "api.chadkluck.net",
				path: "/echo/",
				headers: { "My-Custom-Header": "my custom header value"},
				uri: "",
				protocol: "https",
				body: null,
				parameters: {q: "prime+numbers", limit: "5"},
				options: { timeout: 0}
			};

			let req = new ApiRequest(obj);

			expect(req.getMethod()).to.equal(obj.method);
			expect(req.getBody()).to.equal(obj.body);
			expect(req.getTimeOutInMilliseconds()).to.equal(8000);				


		});
		it('Test timeout', async () => {

			let errorStub, warnStub;

			errorStub = sinon.stub(console, 'error').callsFake(() => {}); // Add callsFake
			warnStub = sinon.stub(console, 'warn').callsFake(() => {});   // Add callsFake

			try {
				
				let obj = {
					method: "GET",
					host: "api.chadkluck.net",
					path: "/echo/",
					headers: { "My-Custom-Header": "my custom header value"},
					uri: "",
					protocol: "https",
					body: null,
					parameters: {q: "prime+numbers", limit: "5"},
					options: { timeout: 2}
				};
			
				let req = new ApiRequest(obj);
				const result = await req.send();
		
				// Separate the assertions
				expect(result.statusCode).to.equal(504);
				expect(result.success).to.equal(false);
				expect(result.message).to.equal("https.request resulted in timeout");
				
				// Give some time for stderr to be captured
				await new Promise(resolve => setTimeout(resolve, 100));

				// Verify log was called
				expect(warnStub.called).to.be.true;

				// If you need to verify specific log content
				expect(warnStub.getCall(0).args[0]).to.include(`[WARN] Endpoint request timeout reached (${obj.options.timeout}ms) for host: ${obj.host}`);
			
				// Give some time for stderr to be captured
				await new Promise(resolve => setTimeout(resolve, 100));
		
				// Verify error was properly stubbed
				expect(errorStub.called).to.be.true;	
			} finally {
				// Restore ALL stubs
				errorStub.restore();
				warnStub.restore();	
			}
			
		});
		
	});
	
});
