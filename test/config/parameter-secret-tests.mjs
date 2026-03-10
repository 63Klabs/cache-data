import { expect } from 'chai';
import { CachedParameterSecrets, CachedSecret, CachedSsmParameter } from '../../src/lib/tools/index.js';

/* 
Create a test that creates 3 CachedSecret and 3 CachedSsmParameter
Then check the name and instance of the cached secret and cached SSM parameter
*/

describe("CachedParameterSecret, CachedSsmParameter, CachedSecret", () => {

	const cachedSecret1 = new CachedSecret("test-secret-1", {refreshAfter: 500});
	const cachedSecret2 = new CachedSecret("test-secret-2", {refreshAfter: 800});
	const cachedSecret3 = new CachedSecret("test-secret-3", {refreshAfter: 1200});
	const cachedSSMParameter1 = new CachedSsmParameter("test-ssm-parameter-1", {refreshAfter: 500});
	const cachedSSMParameter2 = new CachedSsmParameter("test-ssm-parameter-2", {refreshAfter: 800});
	const cachedSSMParameter3 = new CachedSsmParameter("test-ssm-parameter-3", {refreshAfter: 1200});

	describe("CachedParameterSecrets class", () => {
		it("toObject()", async () => {
			expect(CachedParameterSecrets.toObject().objects.length).to.equal(6);
			expect(CachedParameterSecrets.toObject().objects[4].name).to.equal("test-ssm-parameter-2");
		});

		it("getNameTags()", () => {
			expect(CachedParameterSecrets.getNameTags().length).to.equal(6);
			expect(CachedParameterSecrets.getNameTags()[0]).to.equal("test-secret-1 [CachedSecret]");
			expect(CachedParameterSecrets.getNameTags()[1]).to.equal("test-secret-2 [CachedSecret]");
			expect(CachedParameterSecrets.getNameTags()[2]).to.equal("test-secret-3 [CachedSecret]");
			expect(CachedParameterSecrets.getNameTags()[3]).to.equal("test-ssm-parameter-1 [CachedSsmParameter]");
			expect(CachedParameterSecrets.getNameTags()[4]).to.equal("test-ssm-parameter-2 [CachedSsmParameter]");
			expect(CachedParameterSecrets.getNameTags()[5]).to.equal("test-ssm-parameter-3 [CachedSsmParameter]");
		});

		it("getNames()", () => {
			expect(CachedParameterSecrets.getNames().length).to.equal(6);
			expect(CachedParameterSecrets.getNames()[0]).to.equal("test-secret-1");
			expect(CachedParameterSecrets.getNames()[1]).to.equal("test-secret-2");
			expect(CachedParameterSecrets.getNames()[2]).to.equal("test-secret-3");			
			expect(CachedParameterSecrets.getNames()[3]).to.equal("test-ssm-parameter-1");
			expect(CachedParameterSecrets.getNames()[4]).to.equal("test-ssm-parameter-2");
			expect(CachedParameterSecrets.getNames()[5]).to.equal("test-ssm-parameter-3");
		});

	});

	describe("CachedSecret class through CachedParameterSecrets.get()", () => {

		it("Check name and instance of CachedSecret", async () => {
			expect(CachedParameterSecrets.get("test-secret-1").getName()).to.equal("test-secret-1");
			expect(CachedParameterSecrets.get("test-secret-2").getName()).to.equal("test-secret-2");
			expect(CachedParameterSecrets.get("test-secret-3").getName()).to.equal("test-secret-3");
			expect(CachedParameterSecrets.get("test-secret-1").getNameTag()).to.equal("test-secret-1 [CachedSecret]");
			expect(CachedParameterSecrets.get("test-secret-2").getNameTag()).to.equal("test-secret-2 [CachedSecret]");
			expect(CachedParameterSecrets.get("test-secret-3").getNameTag()).to.equal("test-secret-3 [CachedSecret]");
		});

		it("Check object cache properties of CachedSecret", () => {
			expect(CachedParameterSecrets.get("test-secret-1").toObject().cache.refreshAfter).to.equal(500);
			expect(CachedParameterSecrets.get("test-secret-2").toObject().cache.refreshAfter).to.equal(800);
			expect(CachedParameterSecrets.get("test-secret-3").toObject().cache.refreshAfter).to.equal(1200);
		});

	})

	describe("CachedSsmParameter class", () => {

		it("Check name and instance of CachedSsmParameter", async () => {
			expect(CachedParameterSecrets.get("test-ssm-parameter-1").getName()).to.equal("test-ssm-parameter-1");
			expect(CachedParameterSecrets.get("test-ssm-parameter-2").getName()).to.equal("test-ssm-parameter-2");
			expect(CachedParameterSecrets.get("test-ssm-parameter-3").getName()).to.equal("test-ssm-parameter-3");
			expect(CachedParameterSecrets.get("test-ssm-parameter-1").getNameTag()).to.equal("test-ssm-parameter-1 [CachedSsmParameter]");
			expect(CachedParameterSecrets.get("test-ssm-parameter-2").getNameTag()).to.equal("test-ssm-parameter-2 [CachedSsmParameter]");
			expect(CachedParameterSecrets.get("test-ssm-parameter-3").getNameTag()).to.equal("test-ssm-parameter-3 [CachedSsmParameter]");
		});

		it("Check object cache properties of CachedSsmParameter", () => {
			expect(CachedParameterSecrets.get("test-ssm-parameter-1").toObject().cache.refreshAfter).to.equal(500);
			expect(CachedParameterSecrets.get("test-ssm-parameter-2").toObject().cache.refreshAfter).to.equal(800);
			expect(CachedParameterSecrets.get("test-ssm-parameter-3").toObject().cache.refreshAfter).to.equal(1200);
		});

	});
});
