
const {AWS} = require('./AWS.classes');

/**
 * Node version in 0.0.0 format retrieved from process.versions.node if present. '0.0.0' if not present.
 * @type {string}
 */
 const nodeVer = AWS.NODE_VER;

/**
 * Node Major version. This is the first number in the version string. '20.1.6' would return 20 as a number.
 * @type {number}
 */
const nodeVerMajor = AWS.NODE_VER_MAJOR;

/**
 * Node Minor version. This is the second number in the version string. '20.31.6' would return 31 as a number.
 * @type {number}
 */
const nodeVerMinor = AWS.NODE_VER_MINOR;

const nodeVerMajorMinor = AWS.NODE_VER_MAJOR_MINOR;

// >! Hard floor: refuse to run on Node.js majors below the current minimum.
// >! The floor was raised to < 22 in the v1.4.0 Node 20 removal spec; both
// >! Node 20 and Node 21 are now rejected here. The Node 20 entry in the
// >! NODE_DEPRECATION_NOTICES registry in tools/index.js is retained for audit
// >! history but inactive, so the deprecation-warning path is unreachable below
// >! this floor.
if (nodeVerMajor < 22) {
	console.error(`Node.js version 22 or higher is required for @63klabs/cache-data. Version ${nodeVer} detected. Please install Node.js 22 or later in your environment.`);
	process.exit(1);
}

module.exports = {
	nodeVer,
	nodeVerMajor,
	nodeVerMinor,
	nodeVerMajorMinor
}