import { expect } from 'chai';
import {hashThisData} from '../../src/lib/tools/index.js'

/* ****************************************************************************
 * Hash Data
 */
describe("Hash Data", () => {

	describe("General", () => {

		it("Returns string", async () => {

			const data = {
				key: "value"
			}

			const hash = hashThisData("SHA256", data);

			// console.log(hash);

			// test cache object
			expect(typeof hash).to.equal("string")
		});

		it("Simple objects re-arranged return same hash", async () => {
			const data1 = {
				key: "value",
				key2: "value2"
			}

			const data2 = {
				key2: "value2",
				key: "value"
			}

			const hash1 = hashThisData("SHA256", data1);
			const hash2 = hashThisData("SHA256", data2);

			// console.log(hash1);
			// console.log(hash2);

			// test cache object
			expect(hash1).to.equal(hash2)
		})

		it("Hash a String", async () => {
			const hash = hashThisData("SHA256", "Hello World");
			// console.log(hash);
			expect(hash).to.equal("f6ab55d92d5fb24661a5cfa693907e41f3bb0b7e657394479d9968466706b166")
		})

		it("Hash a Number", async () => {
			const hash = hashThisData("SHA256", 1234);
			// console.log(hash);
			expect(hash).to.equal("acfe2f30062203e6ee2c260cce422e36ed819662af9d06f32519310c5617c0c3")
		})

		it("Hash a Boolean", async () => {
			const hash = hashThisData("SHA256", true);
			// console.log(hash);
			expect(hash).to.equal("74e32b84ec102b47c71797fd974fd87c9eee80bcca986bd766b1567da77b99d5")
		})

		it("Hash an Undefined", async () => {
			const hash = hashThisData("SHA256", undefined);
			// console.log(hash);
			expect(hash).to.equal("3b8c1b768a759eed9623446a15cf4ce2a7e70082aa87f3ab933c8f6f2f5aee0b")
		})

		it("Hash a Null", async () => {
			const hash = hashThisData("SHA256", null);
			// console.log(hash);
			expect(hash).to.equal("da92ecddbdeff7d55f7958f938ecdf7ca7c86afcabcb1f695cd7488560cb37df")
		})

		it("Hash a Function", async () => {
			const hash = hashThisData("SHA256", function () { console.log("Hello World")});
			// console.log(hash);
			expect(hash).to.equal("088e8da2fef00d8e251c4307fe45fd9b8dfbc1a769bb9a0567b4c57d427791ef")
		})

		it("Hash a BigInt", async () => {
			const hash = hashThisData("SHA256", 1234n);
			// console.log(hash);
			expect(hash).to.equal("1593e6a47279766ad87c57f9bdaf930c8d9d4bbf942cdae2566b2282208d1268")
		})

		it("Hash a Symbol", async () => {
			const hash = hashThisData("SHA256", Symbol("foo"));
			// console.log(hash);
			expect(hash).to.equal("7773248fce063d7a6d99620c93542e76647be06895a79b2ca9408490f044a376")
		})

		it("Hash a Date", async () => {
			const hash = hashThisData("SHA256", new Date("2024-04-12T01:54:45.873Z"));
			// console.log(hash);
			expect(hash).to.equal("9eed3c651638b063bb7b74cc92f445cbfe2f972245ce142eb2f6568157592544")
		})

		it("Hash an Object", async () => {
			const hash = hashThisData("SHA256", { statement: "Hello, World", id: "58768G", amount: 58.09 });
			// console.log(hash);
			expect(hash).to.equal("00eaa3263b59036da553c0808c5baad8c2ab2ea9fa9992da8eb4b5c5ba60af09")
		})

		it("Hash an Array", async () => {
			const hash = hashThisData("SHA256", [1,2,3,4]);
			// console.log(hash);
			expect(hash).to.equal("056da7b24110d30c74b5c91e3c5007abd0bc6ce726fdc3f1e4447af946255910")
		})
	});

	describe("Simple Object", () => {
		const data1a = {
			greeting: "Hello",
			audience: "World"
		}

		const data1b = {
			audience: "World",
			greeting: "Hello"
		}

		const data2a = {
			greeting: "Goodbye",
			audience: "World"
		}

		const data2b = {
			greeting: "Hello",
			audience: "Pluto"
		}

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);
		
		it("Equal Objects", async () => {
			expect(hash1a).to.equal(hash1a)
		})

		it("Different Objects Round 1", async () => {
			expect(hash1a).to.not.equal(hash2a)
		})

		it("Different Objects Round 2", async () => {
			expect(hash1a).to.not.equal(hash2b)
		})

		it("Different Objects Round 3", async () => {
			expect(hash2a).to.not.equal(hash2b)
		})
	})

	describe("Simple Array", () => {
		const data1a = [
			"Hello",
			"World",
			"Apples",
			"Bananas",
			"Oranges"
		]

		const data1b = [
			"World",
			"Hello",
			"Oranges",
			"Bananas",
			"Apples"
		]

		const data2a = [
			"Goodbye",
			"World",
			"Tangerines",
			"Apples"
		]

		const data2b = [
			"Hello",
			"Pluto",
			"Tangerines",
			"Bananas"
		]

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("Equal Arrays", async () => {
			expect(hash1a).to.equal(hash1b)
		})

		it("Different Arrays Round 1", async () => {
			expect(hash1a).to.not.equal(hash2a)
		})

		it("Different Arrays Round 2", async () => {
			expect(hash1a).to.not.equal(hash2b)
		})

		it("Different Arrays Round 3", async () => {
			expect(hash2a).to.not.equal(hash2b)
		})
	})

	describe("Simple Nested Object", () => {
		const data1a = {
			greeting: "Hello",
			audience: {
				name: "World",
				food: "Apples"
			}
		};

		const data1b = {
			audience: {
				food: "Apples",
				name: "World"
			},
			greeting: "Hello"
		};

		const data2a = {
			greeting: "Goodbye",
			audience: {
				name: "World",
				food: "Apples"
			}
		};

		const data2b = {
			greeting: "Hello",
			audience: {
				name: "Pluto",
				food: "Bananas"
			}
		};

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("Equal Objects", async () => {
			expect(hash1a).to.equal(hash1b)
		})

		it("Different Objects Round 1", async () => {
			expect(hash1a).to.not.equal(hash2a)
		})

		it("Different Objects Round 2", async () => {
			expect(hash1a).to.not.equal(hash2b)
		})

		it("Different Objects Round 3", async () => {
			expect(hash2a).to.not.equal(hash2b)
		})
	})

	describe("Simple Nested Array", () => {
		const data1a = {
			greeting: "Hello",
			audience: [
				"World",
				"Apples",
				"Bananas"
			]
		};

		const data1b = {
			audience: [
				"Apples",
				"World",
				"Bananas"
			],
			greeting: "Hello"
		};

		const data2a = {
			greeting: "Goodbye",
			audience: [
				"World",
				"Apples",
				"Bananas"
			]
		};

		const data2b = {
			greeting: "Hello",
			audience: [
				"Pluto",
				"Bananas",
				"Apples"
			]
		};

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash2a = hashThisData("SHA256", data2a);
		const hash2b = hashThisData("SHA256", data2b);

		it("Equal Objects", async () => {
			expect(hash1a).to.equal(hash1b)
		})

		it("Different Objects Round 1", async () => {
			expect(hash1a).to.not.equal(hash2a)
		})

		it("Different Objects Round 2", async () => {
			expect(hash1a).to.not.equal(hash2b)
		})

		it("Different Objects Round 3", async () => {
			expect(hash2a).to.not.equal(hash2b)
		})

	});

	describe("Nested Data", () => {
		const data1a = {
			phoneNumbers: [
				{ type: "home", number: "8375559876" },
				{ type: "fax", number: "5475551234"  }
			],
			age: 50,
			address: {
				streetAddress: "21 2nd Street",
				city: "New York",
				state: "NY",
				postalCode: "10021"
			},
			firstName: "John",
			email: "john.doe@geocities.com",
			lastName: "Doe"
		}

		// data1a but properties are in random order
		const data1b = {
			lastName: "Doe",
			firstName: "John",
			age: 50,
			address: {
				streetAddress: "21 2nd Street",
				city: "New York",
				state: "NY",
				postalCode: "10021"
			},
			phoneNumbers: [
				{ number: "5475551234", type: "fax"  },
				{ type: "home", number: "8375559876" }
			],
			email: "john.doe@geocities.com"
		};

		// data1a but properties are in random order and missing 1 property
		const data1c = {
			phoneNumbers: [
				{ type: "fax", number: "5475551234" },
				{ number: "8375559876", type: "home" }
			],
			email: "john.doe@geocities.com",
			lastName: "Doe",
			firstName: "John",
			address: {
				state: "NY",
				city: "New York",
				postalCode: "10021",
				streetAddress: "21 2nd Street"
			}
		};

		// data1a but properties are in random order and 1 property changed
		const data1d = {
			phoneNumbers: [
				{ type: "fax", number: "5475551234" },
				{ number: "8375559876", type: "home" }
			],
			email: "john.doe@geocities.com",
			lastName: "Doe",
			age: 50,
			firstName: "John",
			address: {
				state: "NY",
				city: "Albany",
				postalCode: "10021",
				streetAddress: "21 2nd Street"
			}
		};	

		const data2 = {
			lastName: "Hanky",
			firstName: "Hank",
			age: 38,
			address: {
				streetAddress: "810 Hank Way",
				city: "Hanktown",
				state: "NH",
				postalCode: "99999"
			}
		}

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash1c = hashThisData("SHA256", data1c);
		const hash1d = hashThisData("SHA256", data1d);
		const hash2 = hashThisData("SHA256", data2);
		
		it("2 objects, same hash", async () => {
			expect(hash1a).to.equal(hash1b)
		})

		it("2 objects, 1 property difference", async () => {
			expect(hash1a).to.not.equal(hash1c)
		})

		it("2 objects, 1 data difference", async () => {
			expect(hash1a).to.not.equal(hash1d)
		})

		it("2 really different objects", async () => {
			expect(hash1a).to.not.equal(hash2)
		})
	})

	describe("Deeply Nested Data", () => {
		const data1a = {
			firstName: "John",
			lastName: "Doe",
			phoneNumbers: [
				{ type: "home", number: "8375559876" },
				{ type: "fax", number: "5475551234"  }
			],
			age: 50,
			address: {
				streetAddress: "21 2nd Street",
				city: "New York",
				state: "NY",
				postalCode: "10021"
			},
			email: "XXXXXXXXXXXXXXXXXXXXXX",
			hobbies: [
				"Skiing",
				"Golf",
				"Woodworking"
			],
			matrix: [
				[ 1, 2, 3, 4 ],
				[ 5, 6, 7, 8 ],
				[ 9, 10, 11, 12 ],
				[ 13, 14, 15, 16 ]
			],
			foods: [
				[ "Apples", "Oranges", "Bananas"],
				[ "Pizza", "Tacos", "Burgers"],
				[ "Cookies", "Ice Cream", "Cake"]
			],
			children: [
				{
					firstName: "Jane",
					lastName: "Doe",
					age: 20,
					address: {
						streetAddress: "21 2nd Street",
						city: "New York",
						state: "NY",
						postalCode: "10021"
					},
					phoneNumbers: [
						{ type: "home", number: "8375559876" },
						{ type: "fax", number: "5475551234"  }
					],
					email: "XXXXXXXXXXXXXXXXXXXXXX"
				},
				{
					firstName: "Joe",
					lastName: "Doe",
					age: 15,
					address: {
						streetAddress: "21 2nd Street",
						city: "New York",
						state: "NY",
						postalCode: "10021"
					},
					phoneNumbers: [
						{ type: "home", number: "8375559876" },
						{ type: "fax", number: "5475551234"  }
					],
					email: "XXXXXXXXXXXXXXXXXXXXXX"
				}
			]
		}

		const data1b = {
			firstName: "John",
			age: 50,
			lastName: "Doe",
			address: {
				streetAddress: "21 2nd Street",
				city: "New York",
				state: "NY",
				postalCode: "10021"
			},
			email: "XXXXXXXXXXXXXXXXXXXXXX",
			hobbies: [
				"Woodworking",
				"Golf",
				"Skiing"
			],
			phoneNumbers: [
				{ type: "fax", number: "5475551234"  },
				{ type: "home", number: "8375559876" }
			],
			foods: [
				[ "Burgers", "Pizza", "Tacos" ],
				[ "Apples", "Oranges", "Bananas" ],
				[ "Cookies", "Ice Cream", "Cake" ]
			],
			matrix: [
				[ 9, 10, 11, 12 ],
				[ 1, 2, 3, 4 ],
				[ 16, 15, 13, 14 ],
				[ 5, 6, 7, 8 ]
			],
			children: [
				{
					firstName: "Jane",
					lastName: "Doe",
					age: 20,
					address: {
						streetAddress: "21 2nd Street",
						city: "New York",
						state: "NY",
						postalCode: "10021"
					},
					phoneNumbers: [
						{ number: "8375559876", type: "home" },
						{ type: "fax", number: "5475551234"  }
					],
					email: "XXXXXXXXXXXXXXXXXXXXXX"
				},
				{
					firstName: "Joe",
					lastName: "Doe",
					age: 15,
					address: {
						state: "NY",
						streetAddress: "21 2nd Street",
						city: "New York",
						postalCode: "10021"
					},
					phoneNumbers: [
						{ type: "home", number: "8375559876" },
						{ type: "fax", number: "5475551234"  }
					],
					email: "XXXXXXXXXXXXXXXXXXXXXX"
				}
			]
		}

		// make a copy of data1a
		const data1c = JSON.parse(JSON.stringify(data1a));
		// change Oranges to Tangerines in data1a.foods
		data1c.foods[0][1] = "Tangerines";

		// make a copy of data1a
		const data1d = JSON.parse(JSON.stringify(data1a));
		// change city to Albany in data1a.address
		data1d.address.city = "Albany";

		// make a copy of data1a
		const data1e = JSON.parse(JSON.stringify(data1a));
		// add a new child to data1a
		data1e.children.push({
			firstName: "Sarah",
			lastName: "Doe",
			age: 10,
			address: {
				streetAddress: "21 2nd Street",
				city: "New York",
				state: "NY",
				postalCode: "10021"
			}
		});

		// console.log("data1a", data1a);
		// console.log("data1b", data1b);
		// console.log("data1c", data1c);
		// console.log("data1d", data1d);
		// console.log("data1e", data1e);

		const hash1a = hashThisData("SHA256", data1a);
		const hash1b = hashThisData("SHA256", data1b);
		const hash1c = hashThisData("SHA256", data1c);
		const hash1d = hashThisData("SHA256", data1d);
		const hash1e = hashThisData("SHA256", data1e);

		it("Equal complex objects", async () => {
			expect(hash1a).to.equal(hash1b)
		})

		it("Similar complex objects Round 1", async () => {
			expect(hash1a).to.not.equal(hash1c)
		})

		it("Similar complex objects Round 2", async () => {
			expect(hash1a).to.not.equal(hash1d)
		})

		it("Similar complex objects Round 3", async () => {
			expect(hash1a).to.not.equal(hash1e)
		})

		it("Similar complex objects Round 4", async () => {
			expect(hash1b).to.not.equal(hash1c)
		})

		it("Similar complex objects Round 5", async () => {
			expect(hash1b).to.not.equal(hash1d)
		})
	})

	describe("Data Types", () => {

		const timeNow = new Date();
		const timeThen = new Date("December 17, 1995 03:24:00");

		const data1 = {
			symbol: Symbol("APPL"),
			symbol2: Symbol("APPL"),
			bigInt: BigInt(9007199254740991),
			bigInt2: BigInt(8473626171883920),
			Boolean: true,
			Boolean2: false,
			Number: 90.7748,
			Number2: 97732,
			String: "Hello World",
			String2: "Hello Pluto",
			Date: timeNow,
			Date2: timeThen,
			func: function() {
				return "Hello World";
			},
			func2: function() {
				return "Hello Pluto";
			},
			myNull: null,
			myUndefined: undefined
		}

		const data2 = {
			bigInt2: BigInt(8473626171883920),
			symbol: Symbol("APPL"),
			symbol2: Symbol("APPL"),
			myNull: null,
			myUndefined: undefined,
			bigInt: BigInt(9007199254740991),
			Boolean: true,
			String2: "Hello Pluto",
			Boolean2: false,
			Number: 90.7748,
			Number2: 97732,
			String: "Hello World",
			Date: timeNow,
			Date2: timeThen,
			func: function() {
				return "Hello World";
			},
			func2: function() {
				return "Hello Pluto";
			},
		}

		const data3 = {
			bigInt2: BigInt(8473626171883920),
			symbol: Symbol("APPL"),
			symbol2: Symbol("IBM"),
			myNull: null,
			myUndefined: undefined,
			bigInt: BigInt(9007199254740991),
			Boolean: true,
			String2: "Hello Pluto",
			Boolean2: false,
			Number: 90.7748,
			Number2: 97732,
			String: "Hello World",
			Date2: timeNow,
			Date: timeThen,
			func: function() {
				return "Hello World";
			},
			func2: function() {
				return "Hello Pluto";
			},
		}

		const dataDates1 = {
			greeting: "Hello World",
			start: timeNow
		}

		const dataDates2 = {
			start: timeNow,
			greeting: "Hello World",
		}

		const dataDates3 = {
			greeting: "Hello World",
			start: timeThen
		}

		const dataBigInt1 = {
			greeting: "Hello World",
			distance: BigInt(9007199254740991)
		}

		const dataBigInt2 = {
			distance: BigInt(9007199254740991),
			greeting: "Hello World",
		}

		const dataBigInt3 = {
			distance: BigInt(8473626171883920),
			greeting: "Hello World",
		}

		const dataFunc1 = {
			greeting: "Hello World",
			func: function() {
				return "Hello World";
			}
		}

		const dataFunc2 = {
			func: function() {
				return "Hello World";
			},
			greeting: "Hello World",

		}

		const dataFunc3 = {
			greeting: "Hello World",
			func: function() {
				return "Hello Pluto";
			}
		}

		const hash1 = hashThisData("SHA256", data1);
		const hash2 = hashThisData("SHA256", data2);
		const hash3 = hashThisData("SHA256", data3);
		const hashDates1 = hashThisData("SHA256", dataDates1);
		const hashDates2 = hashThisData("SHA256", dataDates2);
		const hashDates3 = hashThisData("SHA256", dataDates3);
		const hashBigInt1 = hashThisData("SHA256", dataBigInt1);
		const hashBigInt2 = hashThisData("SHA256", dataBigInt2);
		const hashBigInt3 = hashThisData("SHA256", dataBigInt3);
		const hashFunc1 = hashThisData("SHA256", dataFunc1);
		const hashFunc2 = hashThisData("SHA256", dataFunc2);
		const hashFunc3 = hashThisData("SHA256", dataFunc3);

		it("Equal data type objects", async () => {
			expect(hash1).to.equal(hash2)
		})

		it("Different data type objects", async () => {
			expect(hash1).to.not.equal(hash3)
		})

		it("Dates: Equal", async () => {
			expect(hashDates1).to.equal(hashDates2)
		})

		it("Dates: Different", async () => {
			expect(hashDates1).to.not.equal(hashDates3)
		})

		it("BigInt: Equal", async () => {
			expect(hashBigInt1).to.equal(hashBigInt2)
		})

		it("BigInt: Different", async () => {
			expect(hashBigInt1).to.not.equal(hashBigInt3)
		})

		it("Function: Equal", async () => {
			expect(hashFunc1).to.equal(hashFunc2)
		})

	});

	// Feature: reduce-json-stringify - Edge Cases for structuredClone optimization
	describe("Edge Cases for structuredClone optimization", () => {

		describe("hashThisData with various data types", () => {
			it("should handle empty objects", () => {
				const hash = hashThisData("SHA256", {});
				expect(typeof hash).to.equal("string");
				expect(hash.length).to.be.greaterThan(0);
			});

			it("should handle empty arrays", () => {
				const hash = hashThisData("SHA256", []);
				expect(typeof hash).to.equal("string");
				expect(hash.length).to.be.greaterThan(0);
			});

			it("should handle objects with null values", () => {
				const data = { a: null, b: null };
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});

			it("should handle arrays with null values", () => {
				const data = [null, null, null];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});

			it("should handle mixed types in objects", () => {
				const data = {
					string: "test",
					number: 123,
					boolean: true,
					null: null,
					array: [1, 2, 3],
					object: { nested: "value" }
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});

			it("should handle mixed types in arrays", () => {
				const data = ["string", 123, true, null, [1, 2], { key: "value" }];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});
		});

		describe("Options cloning with nested structures", () => {
			it("should handle options with salt", () => {
				const data = { test: "value" };
				const hash1 = hashThisData("SHA256", data, { salt: "salt1" });
				const hash2 = hashThisData("SHA256", data, { salt: "salt2" });
				expect(hash1).to.not.equal(hash2);
			});

			it("should handle options with iterations", () => {
				const data = { test: "value" };
				const hash1 = hashThisData("SHA256", data, { iterations: 1 });
				const hash2 = hashThisData("SHA256", data, { iterations: 2 });
				expect(hash1).to.not.equal(hash2);
			});

			it("should handle options with both salt and iterations", () => {
				const data = { test: "value" };
				const hash = hashThisData("SHA256", data, { salt: "test", iterations: 3 });
				expect(typeof hash).to.equal("string");
			});

			it("should handle empty options object", () => {
				const data = { test: "value" };
				const hash = hashThisData("SHA256", data, {});
				expect(typeof hash).to.equal("string");
			});
		});

		describe("Normalization behavior preservation", () => {
			it("should normalize BigInt values", () => {
				const data1 = { value: BigInt(123) };
				const data2 = { value: BigInt(123) };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).to.equal(hash2);
			});

			it("should normalize undefined values", () => {
				const data1 = { a: undefined, b: "test" };
				const data2 = { a: undefined, b: "test" };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).to.equal(hash2);
			});

			it("should produce consistent hashes for objects with same content but different key order", () => {
				const data1 = { a: 1, b: 2, c: 3 };
				const data2 = { c: 3, a: 1, b: 2 };
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				expect(hash1).to.equal(hash2);
			});

			it("should produce consistent hashes for arrays with same content but different order", () => {
				const data1 = [1, 2, 3];
				const data2 = [3, 2, 1];
				const hash1 = hashThisData("SHA256", data1);
				const hash2 = hashThisData("SHA256", data2);
				// Arrays are sorted, so hashes should be equal
				expect(hash1).to.equal(hash2);
			});

			it("should handle deeply nested objects", () => {
				const data = {
					level1: {
						level2: {
							level3: {
								level4: {
									value: "deep"
								}
							}
						}
					}
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});

			it("should handle deeply nested arrays", () => {
				const data = [[[[[1, 2, 3]]]]];
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});

			it("should handle mixed nested structures", () => {
				const data = {
					array: [
						{ nested: [1, 2, 3] },
						{ nested: [4, 5, 6] }
					],
					object: {
						array: [7, 8, 9]
					}
				};
				const hash = hashThisData("SHA256", data);
				expect(typeof hash).to.equal("string");
			});
		});
	});
});
