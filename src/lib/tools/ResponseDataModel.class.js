const { safeClone } = require('./utils');

/**
 * ResponseDataModel class for collecting and structuring response data.
 * Provides methods to build complex response objects by adding items with keys or as array elements.
 * Supports creating structured skeletons during construction and filling them during execution.
 * Handles key collisions by converting single values to arrays when duplicate keys are added.
 * 
 * @class ResponseDataModel
 * @example
 * // Create response with skeleton
 * const response = new ResponseDataModel({ users: [], metadata: {} }, 'data');
 * response.addItemByKey({ id: 1, name: 'John' }, 'users');
 * response.addItemByKey({ id: 2, name: 'Jane' }, 'users');
 * console.log(response.toString());
 * // Output: {"data":{"users":[{"id":1,"name":"John"},{"id":2,"name":"Jane"}],"metadata":{}}}
 * 
 * @example
 * // Add items to array
 * const list = new ResponseDataModel(null, 'items');
 * list.addItem({ id: 1 });
 * list.addItem({ id: 2 });
 * console.log(list.toString());
 * // Output: {"items":[{"id":1},{"id":2}]}
 */
class ResponseDataModel {

	_responseData = null;
	_label = "";

	/**
	 * Creates a new ResponseDataModel instance for collecting response data.
	 * A data skeleton may be passed in with various fields set to {}, [], "", null, or default values.
	 * 
	 * @param {*} [data=null] - Initial data structure (can be a skeleton or complete object)
	 * @param {string} [label=""] - Label to use as a key when this object is added to another ResponseDataModel
	 * @example
	 * // Create with skeleton
	 * const response = new ResponseDataModel({ users: [], count: 0 }, 'data');
	 * 
	 * @example
	 * // Create empty
	 * const response = new ResponseDataModel();
	 */
	constructor(data = null, label = "") {
		if (data !== null) {
			this._responseData = data;
		}

		if (label !== "") {
			this._label = label;
		}
	};
	
	/**
	 * Gets the label that will be used when this object is added to another ResponseDataModel.
	 * 
	 * @returns {string} The label to use as a key for the object
	 * @example
	 * const response = new ResponseDataModel({ id: 1 }, 'user');
	 * console.log(response.getLabel()); // 'user'
	 */
	getLabel() {
		return this._label;
	};

	/**
	 * Gets a copy of the response data object.
	 * 
	 * @returns {*} A cloned copy of the data object
	 * @example
	 * const data = response.getResponseData();
	 * console.log(data);
	 */
	getResponseData() {
		return safeClone(this._responseData);
	};

	/**
	 * Adds an item as part of an array or under a labeled key.
	 * - If responseData is null, transforms it into an array and adds item at index 0
	 * - If responseData is an array, adds item as the next element
	 * - If responseData is an object, adds item as an array element under the label (or 'items' if no label)
	 * 
	 * @param {ResponseDataModel|*} item - Item to add (can be ResponseDataModel or any value)
	 * @returns {void}
	 * @example
	 * const response = new ResponseDataModel();
	 * response.addItem({ id: 1, name: 'John' });
	 * response.addItem({ id: 2, name: 'Jane' });
	 * // Result: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]
	 * 
	 * @example
	 * // Add with label
	 * const item = new ResponseDataModel({ id: 1 }, 'user');
	 * response.addItem(item);
	 * // Result: { user: [{ id: 1 }] }
	 */
	addItem(item) {

		let data = null;
		let label = "";

		if ( item instanceof ResponseDataModel ) {
			data = item.getResponseData();
			label = item.getLabel(); // see if there is an override key/label
		} else {
			// Clone plain objects to prevent external mutation
			// If cloning fails (e.g., functions, symbols), use the original value
			if (typeof item === 'object' && item !== null) {
				try {
					data = safeClone(item);
				} catch (e) {
					// If safeClone fails, fall back to original value
					data = item;
				}
			} else {
				data = item;
			}
		}

		if ( label === "" ) {
			if ( this._responseData === null ) {
				this._responseData = [];
			}

			if ( Array.isArray(this._responseData)) {
				this._responseData.push(data);
			} else if ( this._responseData instanceof Object ) {
				if ( !("items" in this._responseData) || this._responseData.items === null) {
					this._responseData.items = [];
				}
				this._responseData.items.push(data);
			}
		} else {
			if ( this._responseData === null ) {
				this._responseData = {};
			}

			if ( !(label in this._responseData) || this._responseData[label] === null) {
				this._responseData[label] = [];
			}

			this._responseData[label].push(data);
		}
		
	};
	
	/**
	 * Adds an item by a specific key.
	 * If the key exists and contains non-empty data, converts to array and appends new item.
	 * If the key doesn't exist or contains placeholder data, replaces with new item.
	 * 
	 * @param {ResponseDataModel|*} item - Item to add (can be ResponseDataModel or any value)
	 * @param {string} [key=""] - Key to use for the item (overrides item's label if provided)
	 * @returns {void}
	 * @example
	 * const response = new ResponseDataModel({});
	 * response.addItemByKey({ id: 1, name: 'John' }, 'user');
	 * response.addItemByKey({ id: 2, name: 'Jane' }, 'user');
	 * // Result: { user: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] }
	 * 
	 * @example
	 * // Override label
	 * const item = new ResponseDataModel({ id: 1 }, 'employee');
	 * response.addItemByKey(item, 'employees'); // Pluralize the label
	 */
	addItemByKey(item, key = "") {

		if ( this._responseData === null ) {
			this._responseData = {};
		}

		let data = null;
		let label = "";

		if ( item instanceof ResponseDataModel ) {
			data = item.getResponseData();
			label = (key !== "" ? key : item.getLabel() ); // see if there is an override key/label
		} else {
			// Clone plain objects to prevent external mutation
			// If cloning fails (e.g., functions, symbols), use the original value
			if (typeof item === 'object' && item !== null) {
				try {
					data = safeClone(item);
				} catch (e) {
					// If safeClone fails, fall back to original value
					data = item;
				}
			} else {
				data = item;
			}
			label = key;
		}

		// check if the key exists, if it does (and it is not an "empty" placeholder) then we will add this item to an array
		if ( label in this._responseData 
			&& this._responseData[label] !== null // any placeholder
			&& this._responseData[label] !== "" // string placeholder
			&& this._responseData[label] != 0 // number placeholder
			&& !( this._responseData[label] instanceof Object && Object.keys(this._responseData[label]).length === 0 && Object.getPrototypeOf(this._responseData[label]) === Object.prototype ) // object placeholder
			) {
			// if it is not yet an array, convert to array and move existing data to index 0
			if ( !Array.isArray(this._responseData[label]) ) {
				let temp = safeClone(this._responseData[label]); // no pointers, create copy
				this._responseData[label] = []; // reassign to array
				this._responseData[label].push(temp); // move original element to array
			}
			this._responseData[label].push(data); // push the new data onto array
		} else {
			this._responseData[label] = data; // replace
		}
		
	};
	
	/**
	 * Converts the response data to an object.
	 * If there's a label, returns the data as a key-value pair with the label as the key.
	 * If no label, returns the data directly.
	 * 
	 * @returns {*} The data object, optionally wrapped with label as key
	 * @example
	 * const response = new ResponseDataModel({ id: 1 }, 'user');
	 * console.log(response.toObject());
	 * // Output: { user: { id: 1 } }
	 * 
	 * @example
	 * const response = new ResponseDataModel({ id: 1 });
	 * console.log(response.toObject());
	 * // Output: { id: 1 }
	 */
	toObject() {
		let obj = {};
		if (this._label === "") {
			obj = this.getResponseData();
		} else {
			let key = this._label;
			obj[key] = this.getResponseData();
		}
		return obj;
	};

	/**
	 * Converts the response data to a JSON string.
	 * Uses toObject() to get the object representation, then stringifies it.
	 * 
	 * @returns {string} JSON string representation of the response data
	 * @example
	 * const response = new ResponseDataModel({ users: [{ id: 1 }] }, 'data');
	 * console.log(response.toString());
	 * // Output: '{"data":{"users":[{"id":1}]}}'
	 */
	toString() {
		return JSON.stringify(this.toObject());
	};

};

module.exports = ResponseDataModel;