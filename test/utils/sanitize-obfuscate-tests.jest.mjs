import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { obfuscate, sanitize, DebugAndLog } from '../../src/lib/tools/index.js';

/**
 * Sanitize and Obfuscate Tests (Jest Migration)
 * 
 * Tests for sanitize() and obfuscate() utility functions covering:
 * - Obfuscation of sensitive data in objects
 * - Handling of nested objects and arrays
 * - Preservation of non-sensitive data
 * - String masking with configurable options
 * - Empty and short string handling
 * 
 * Requirements: 5.3, 5.10, 5.11, 5.12
 */

describe("Sanitize and Obfuscate", () => {

	describe("Obfuscate", () => {
		it("should obfuscate with default settings", () => {
			let str = "ThisIsMyExample12345678";
		
			expect(obfuscate(str)).toBe('******5678');
		});

		it("should obfuscate with custom pad character", () => {
			let str = "ThisIsMyExample12345678";
			let opt = { char: 'X' };
		
			expect(obfuscate(str, opt)).toBe('XXXXXX5678');
		});

		it("should obfuscate with custom keep value", () => {
			let str = "ThisIsMyExample12345679";
			let opt = { keep: 6 };
		
			expect(obfuscate(str, opt)).toBe('****345679');
		});

		it("should obfuscate with keep upper limit", () => {
			let str = "ThisIsMyExample12345678";
			let opt = { keep: 8 };
		
			expect(obfuscate(str, opt)).toBe('****345678');
		});

		it("should obfuscate with keep lower limit", () => {
			let str = "1234";
			let opt = { keep: 8 };
		
			expect(obfuscate(str, opt)).toBe('*********4');
		});

		it("should obfuscate with set size", () => {
			let str = "1234567890123456789";
			let opt = { keep: 4, len: 16 };
		
			expect(obfuscate(str, opt)).toBe('************6789');
		});

	});

	describe("Sanitize", () => {
		it("should sanitize object without errors", () => {
			const obj = {
				secret: "123456",
				secret1: "hdEXAMPLEsuaskleasdkfjs8e229das-43332",
				apiId: null,
				apiKey1: 10009372811,
				apiKey2: null,
				apiKey3: true,
				apiKey4: false,
				apiKey5: 'null',
				apiKey6: "5773ec73EXAMPLE123456",
				apiKey7: "82777111004727281981",
				apiKey8: "true",
				apiKey9: "false",
				"secret-pin": 457829110,
				"pin-token": "5843920573822",
				urls: {
					uri_1: "https://www.api.example.com/api/?count=433&apiKey=DD2EXAMPLE38B9E4369248330EFBB58D6B1431AFB03C8E1D&debug=true"
				}
			};
			
			let o = sanitize(obj);
			let test_o = ("message" in o && o.message === "Error sanitizing object");

			expect(test_o).toBe(false);
		});

		it("should sanitize simple object values", () => {
			const obj = {
				secret: "123456",
				secret1: "hdEXAMPLEsuaskleasdkfjs8e229das-43332",
				apiId: null,
				apiKey1: 123456789012345,
				apiKey2: null,
				apiKey3: true,
				apiKey4: false,
				apiKey5: 'null',
				apiKey6: "5773ec73EXAMPLE123456",
				apiKey7: "82777111004727281981",
				apiKey8: "true",
				apiKey9: "false",
				"secret-pin": 457829110,
				"pin-token": "5843920573822"
			};

			let o = sanitize(obj);

			expect(o.secret).toBe("********56");
			expect(o.secret1).toBe("******3332");
			expect(o.apiId).toBeNull();
			expect(o.apiKey1).toBe(9999992345);
			expect(o.apiKey2).toBeNull();
			expect(o.apiKey3).toBe(true);
			expect(o.apiKey4).toBe(false);
			expect(o.apiKey5).toBe("null");
			expect(o.apiKey6).toBe("******3456");
			expect(o.apiKey7).toBe("******1981");
			expect(o.apiKey8).toBe("true");
			expect(o.apiKey9).toBe("false");
			expect(o['secret-pin']).toBe(9999999110);
			expect(o['pin-token']).toBe("******3822");
		});

		it("should sanitize strings with query parameters", () => {
			const obj = {
				urls: {
					uri_1: "https://www.api.example.com/api/?count=433&apiKey=DD2EXAMPLE38B9E4369248330EFBB58D6B1431AFB03C8E1D&debug=true",
					uri_2: "https://www.api.example.com/api/?secret=5ZQDEXAMPLE9jhp51qVE5199xU4zj2X2wSPGwNpDub2CiSJO3i",
					uri_3: "https://www.api.example.com/api/?token=CE3EXAMPLE62359AAFCB1F8C5BAF4692FD67C18&debug=true",
					uri_4: "https://www.api.example.com/api/?secret_token=4DAEXAMPLE9155E26A75C6D83E208FF518EAFE4&debug=true",
					uri_5: "https://www.api.example.com/api/?count=433&key=NeREXAMPLEPfka6TETPfHvNoLP4WPBxhhsrOzOh9HyC&debug=true",
					uri_6: "https://www.api.example.com/api/?apitoken=jq3PEXAMPLEGKQDhKjJVo33hRVPK36q0r9-asdf_asdf",
					uri_7: "https://www.api.example.com/api/?api_key=711EXAMPLE9971F47DE25C366F9AB506A1BFD&debug=true",
					uri_8: "https://www.api.example.com/api/?secret-key=93EXAMPLE326A9B41C3DF94BED6E4C9DC524A4F6",
					uri_9: "https://www.api.example.com/api/?client_secret=6C844EXAMPLEDE60C4104936541D4EAB32404DA&debug=true",
					uri_10: "https://www.api.example.com/api/?count=433&list=daisy&test=true&api_secret=lYbEXAMPLE6y4GYvFjmW0F8bGAXtcogmkRGa3hkgph530&debug=true",
					uri_11: "https://www.api.example.com/api/?count=433&api_token=lYb6y4GEXAMPLEYvFjmW0F8bGAXtcogmkRGa3hkgph530&debug=true",
					uri_12: "https://www.api.example.com/api/?count=433",
					uri_13: "https://www.api.example.com/api/?pin-token=899EXAMPLE201948271848271",
					uri_14: "https://www.api.example.com/api/?secret-pin=43123456789"
				}
			};

			let o = sanitize(obj).urls;

			expect(o.uri_1).toBe("https://www.api.example.com/api/?count=433&apiKey=******8E1D&debug=true");
			expect(o.uri_2).toBe("https://www.api.example.com/api/?secret=******JO3i");
			expect(o.uri_3).toBe("https://www.api.example.com/api/?token=******7C18&debug=true");
			expect(o.uri_4).toBe("https://www.api.example.com/api/?secret_token=******AFE4&debug=true");
			expect(o.uri_5).toBe("https://www.api.example.com/api/?count=433&key=******9HyC&debug=true");
			expect(o.uri_6).toBe("https://www.api.example.com/api/?apitoken=******asdf");
			expect(o.uri_7).toBe("https://www.api.example.com/api/?api_key=******1BFD&debug=true");
			expect(o.uri_8).toBe("https://www.api.example.com/api/?secret-key=******A4F6");
			expect(o.uri_9).toBe("https://www.api.example.com/api/?client_secret=******04DA&debug=true");
			expect(o.uri_10).toBe("https://www.api.example.com/api/?count=433&list=daisy&test=true&api_secret=******h530&debug=true");
			expect(o.uri_11).toBe("https://www.api.example.com/api/?count=433&api_token=******h530&debug=true");
			expect(o.uri_12).toBe("https://www.api.example.com/api/?count=433");
			expect(o.uri_13).toBe("https://www.api.example.com/api/?pin-token=******8271");
			expect(o.uri_14).toBe("https://www.api.example.com/api/?secret-pin=*******789");
		});

		it("should sanitize Authorization headers", () => {
			const obj = {
				headers: {
					auth_1: { Authorization: "Digest username=username, asdfa=\"asdfab\",\nasdfac=\"asdfad\",\naasdfae=\"dsffadf\",\nasdfsf=48f0e" },
					auth_2: { Authorization: "Bearer dasd/4rVEXAMPLE4MjOdjA3pu9rJ5qc9RKuCoAO8UaxuWUGXUtuzRJKdRTvKMVe3dJ9FN1SyF9n==" },
					auth_3: { Authorization: "App D4D0BEXAMPLEB1B2F12B5E97405C764CA45F" },
					auth_4: { Authorization: "IPSO dasd+F51B6EXAMPLE3334AD3520894712D15D8F1105ED3DD" },
					auth_5: { Authorization: "Key hJdiEXAMPLElwrzM9616MJsDGBiK4qjeJFYB0zmHPxYNUrn8D54ycAN7gwedqHt0UiCWTb" },
					auth_6: { Authorization: "Digest username=EXAMPLE, oauth=\"hhasjjjd+ddad\",\nnonce=\"dsffadf\",\nhash=\"ef05bc-89c2\",\nclient=myapp" },
					auth_7: { Authorization: "Digest username=\"6551156d-EXAMPLE-4b7d-945f-310ff10943c5\", realm=\"bob@contoso.com\", qop=auth, algorithm=MD5-sess, uri=\"sip:bob@contoso.com;gruu;opaque=app:conf:focus:id:854T0R7G\", nonce=\"h8A4ZW22ygGZozIIGZcb43waVMEM6Gq\", nc=1, cnonce=\"\", opaque=\"0C1D4536\", response=\"b4543cd4d6a923b4ab4fd4583af48f0e\"" },
					auth_8: { Authorization: `Digest username=\"6551156d-EXAMPLE-4b7d-945f-310ff10943c5\",
						realm=\"bob@contoso.com\",
						qop=auth,
						algorithm=MD5-sess,
						uri=\"sip:bob@contoso.com;gruu;opaque=app:conf:focus:id:854T0R7G\",
						nonce=\"h8A4ZEXAMPLEW22ygGZozIIGZcb43waVMEM6Gq\",
						nc=1, cnonce=\"\",
						opaque=\"0C1D4536\",
						response=\"b4543EXAMPLEcd4d6a923b4ab4fd4583af48f0e\"` }
				}
			};

			let o = sanitize(obj).headers;

			expect(o.auth_1.Authorization).toBe("Digest ******8f0e");
			expect(o.auth_2.Authorization).toBe("Bearer ******9n==");
			expect(o.auth_3.Authorization).toBe("App ******A45F");
			expect(o.auth_4.Authorization).toBe("IPSO ******D3DD");
			expect(o.auth_5.Authorization).toBe("Key ******CWTb");
			expect(o.auth_6.Authorization).toBe("Digest ******yapp");
			expect(o.auth_7.Authorization).toBe("Digest ******0e\"");
			expect(o.auth_8.Authorization).toBe("Digest ******0e\"");
		});

		it("should sanitize array of secrets", () => {
			const obj = {
				multiValueHeaders: {
					Host: [
						"myapi.api.example.com"
					],
					"Postman-Token": [
						"86071fc6-EXAMPLE-4ff5-8eb5-d44ce06e3eed"
					],
					"User-Agent": [
						"PostmanRuntime/7.31.1"
					],
					"X-Forwarded-For": [
						"10.61.41.39"
					],
					"Client-Keys": [
						"e0c4EXAMPLE1234567890ABCDEF",
						"78a5EXAMPLE1234567890abcdef"
					],
					"Client-Secrets": [
						"e0c4EXAMPLE1234567890QRSTUVWXYZ",
						"78a5EXAMPLE1234567890qrstuvwxyz",
						"40b4EXAMPLE1234567890qRsTuVwXyZ"
					],
					"Client-Tokens": [
						"e0c4EXAMPLE1234567890LMNOP",
						"78a5EXAMPLE1234567890lmnop",
						"40b4EXAMPLE1234567890lMnOp",
						"9ce7EXAMPLE1234567890lMNop"
					]
				}
			};

			let o = sanitize(obj).multiValueHeaders;
			
			expect(o['Postman-Token'][0]).toBe("******3eed");
			expect(o['Client-Keys'][0]).toBe("******CDEF");
			expect(o['Client-Keys'][1]).toBe("******cdef");
			expect(o['Client-Secrets'][0]).toBe("******WXYZ");
			expect(o['Client-Secrets'][1]).toBe("******wxyz");
			expect(o['Client-Secrets'][2]).toBe("******wXyZ");
			expect(o['Client-Tokens'][0]).toBe("******MNOP");
			expect(o['Client-Tokens'][1]).toBe("******mnop");
			expect(o['Client-Tokens'][2]).toBe("******MnOp");
			expect(o['Client-Tokens'][3]).toBe("******MNop");
		});

	});
	
	describe("Sanitize Debug and Log", () => {

		let logSpy, warnSpy, errorSpy;

		beforeEach(() => {
			logSpy = jest.spyOn(console, 'log').mockImplementation();
			warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			errorSpy = jest.spyOn(console, 'error').mockImplementation();
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		it("should sanitize log output", async () => {
			const obj = {
				secret: "123456",
				secret1: "hdEXAMPLEsuaskleasdkfjs8e229das-43332",
				apiKey1: 123456789012345,
				apiKey6: "5773ec73EXAMPLE123456",
				apiKey7: "82777111004727281981",
				"secret-pin": 457829110,
				"pin-token": "5843920573822"
			};

			// Call the log function
			await DebugAndLog.log("My Object", "LOG", obj);

			// Verify that log was actually called
			expect(logSpy).toHaveBeenCalled();

			// Get the log output from the first call
			const logOutput = logSpy.mock.calls[0].join(' ')
				.replace(/\u001b\[\d+m/g, '') // remove colorization of console text
				.trim();

			// Assertions
			expect(logOutput).toContain("[LOG] My Object");
			expect(logOutput).toContain("********56");
			expect(logOutput).toContain("******3332");
			expect(logOutput).toContain("9999992345");
			expect(logOutput).toContain("******3456");
			expect(logOutput).toContain("******1981");
			expect(logOutput).toContain("9999999110");
			expect(logOutput).toContain("******3822");
		});

		it("should sanitize warning output", async () => {
			const obj = {
				secret: "123456",
				secret1: "hdEXAMPLEsuaskleasdkfjs8e229das-43332",
				apiKey1: 123456789012345,
				apiKey6: "5773ec73EXAMPLE123456",
				apiKey7: "82777111004727281981",
				"secret-pin": 457829110,
				"pin-token": "5843920573822"
			};

			DebugAndLog.warn("My Object", obj);

			expect(warnSpy).toHaveBeenCalled();
			
			// Get the warning output and remove ANSI color codes
			const warnOutput = warnSpy.mock.calls[0]
				.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg)
				.join(' ')
				.replace(/\u001b\[\d+m/g, '') // remove colorization of console text
				.trim();

			expect(warnOutput).toContain("[WARN] My Object");
			expect(warnOutput).toContain("********56");
			expect(warnOutput).toContain("******3332");
			expect(warnOutput).toContain("9999992345");
			expect(warnOutput).toContain("******3456");
			expect(warnOutput).toContain("******1981");
			expect(warnOutput).toContain("9999999110");
			expect(warnOutput).toContain("******3822");
		});

		it("should sanitize error output", async () => {
			const obj = {
				secret: "123456",
				secret1: "hdEXAMPLEsuaskleasdkfjs8e229das-43332",
				apiKey1: 123456789012345,
				apiKey6: "5773ec73EXAMPLE123456",
				apiKey7: "82777111004727281981",
				"secret-pin": 457829110,
				"pin-token": "5843920573822"
			};

			DebugAndLog.error("My Object", obj);

			expect(errorSpy).toHaveBeenCalled();
			
			// Get the error output and remove ANSI color codes
			const errorOutput = errorSpy.mock.calls[0]
				.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg)
				.join(' ')
				.replace(/\u001b\[\d+m/g, '') // remove colorization of console text
				.trim();

			expect(errorOutput).toContain("[ERROR] My Object");
			expect(errorOutput).toContain("********56");
			expect(errorOutput).toContain("******3332");
			expect(errorOutput).toContain("9999992345");
			expect(errorOutput).toContain("******3456");
			expect(errorOutput).toContain("******1981");
			expect(errorOutput).toContain("9999999110");
			expect(errorOutput).toContain("******3822");
		});
	});

});
