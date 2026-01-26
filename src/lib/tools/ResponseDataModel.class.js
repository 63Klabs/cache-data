const { safeClone } = require('./utils');

/* ****************************************************************************
 * Response Data Model
 * ----------------------------------------------------------------------------
 * 
 * Provides a class that can be used to store and complie data to send back
 * as a response.
 * 
 *************************************************************************** */

/**
 * A response object that can be used to collect data to be sent back as a response.
 * A structured skeleton may be created during construction to create an order of
 * presenting various keys. As the program executes, additional data may be added.
 * Other response objects may be added with keys to fill out the object. If there are
 * key collisions then new items matching that key are added as an element in an array.
 * 
 * Extends ResponseDataModel, can be used to extend as an interface.
 * 
 * @example
 * let obj = new Response(); // you can pass a skeleton that you will add to, or the full object to the constructor
 * obj.addItem(newItem); // where newItem is another response object or regular structured object which will be added as a node
 * obj.addItemByKey(newItem2,"employees");// where newItem2 is another response object or regular structured object which will be added as a node. Note that you can override a label by passing a new one. For example pluralizing a label
 * obj.removeEmpty(); // optional, it will remove empty keys
 * 	response = {
 * 		statusCode: 200,
 * 		body: dataResponse.toString(),
 * 		headers: {'content-type': 'application/json'}
 * 	};
 *
 */
class ResponseDataModel {

	_responseData = null;
	_label = "";

	/**
	 * Used for collecting parts of a response. A data skeleton may be passed in as an object.
	 * 
	 * @param {*} data Can be a skeleton with various fields set to {}, [], "", null or defaults.
	 * @param {*} label 
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
	 * Get the label that will be used when this object is added to another 
	 * ResponseDataModel or returned as a response
	 * @returns {string} a label to use as a key for the object
	 */
	getLabel() {
		return this._label;
	};

	/**
	 * Get the data object
	 * @returns {*} A copy of the data object
	 */
	getResponseData() {
		return safeClone(this._responseData);
	};

	/**
	 * Add an item as part of an array.
	 * If the responseObject is null, it will be transformed into an array and the item will be added at index 0
	 * If the responseObject is an array, the item will be added as the next index
	 * If the responseObject is an object, the item will be added as an array element under the label (or 'items' if label is "")
	 * @param {ResponseDataModel|*} item 
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
	 * Add an item by key
	 * @param {ResponseDataModel|*} item 
	 * @param {string} key 
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
	 * 
	 * @returns {*} The data object. If there is a label then it is returned as a key value pair where the label is the key
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
	 * 
	 * @returns {string} A stringified JSON object (using .toObject() ) for use as a response
	 */
	toString() {
		return JSON.stringify(this.toObject());
	};

};

module.exports = ResponseDataModel;