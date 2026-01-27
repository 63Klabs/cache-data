/* */
const DebugAndLog = require("./DebugAndLog.class");

/**
 * Timer class for measuring execution time and tracking performance metrics.
 * Provides methods to start, stop, and query elapsed time with diagnostic logging.
 * 
 * @class Timer
 * @example
 * // Create and start a timer
 * const timer = new Timer('myOperation', true);
 * // ... perform operation ...
 * const elapsed = timer.stop();
 * console.log(`Operation took ${elapsed}ms`);
 * 
 * @example
 * // Create timer without auto-start
 * const timer = new Timer('delayedOperation');
 * await timer.start();
 * // ... perform operation ...
 * timer.stop();
 */
class Timer {
	/**
	 * Creates a new Timer instance.
	 * 
	 * @param {string} name - The name of the timer for identification in logs
	 * @param {boolean} [start=false] - Whether to automatically start the timer upon creation
	 * @example
	 * // Create timer with auto-start
	 * const timer = new Timer('apiCall', true);
	 * 
	 * @example
	 * // Create timer without auto-start
	 * const timer = new Timer('batchProcess');
	 * await timer.start();
	 */
	constructor(name, start = false) {
		this.name = name;
		this.startTime = -1;
		this.stopTime = -1;
		this.latestMessage = "";
		
		if (start) {
			this.start();
		} else {
			this.updateMessage("Timer '"+this.name+"' created at  "+this.now());
		}
	};

	/**
	 * Updates the timer's internal message and logs it for diagnostics.
	 * 
	 * @param {string} message - The message to set and log
	 * @returns {Promise<void>}
	 * @example
	 * await timer.updateMessage('Processing batch 1 of 10');
	 */
	async updateMessage(message) {
		this.latestMessage = message;
		DebugAndLog.diag(this.latestMessage);
	};

	/**
	 * Starts the timer if it hasn't been started already.
	 * Records the start time and logs a diagnostic message.
	 * 
	 * @returns {Promise<void>}
	 * @example
	 * const timer = new Timer('operation');
	 * await timer.start();
	 * // ... perform operation ...
	 * timer.stop();
	 */
	async start() {
		if ( this.startTime === -1 ) {
			this.startTime = this.now();
			this.updateMessage("Timer '"+this.name+"' started at "+this.startTime);
		}
	};

	/**
	 * Stops the timer if it hasn't been stopped already.
	 * Records the stop time, logs elapsed time, and returns the elapsed duration.
	 * 
	 * @returns {number} The time elapsed in milliseconds between start and stop
	 * @example
	 * const timer = new Timer('dataProcessing', true);
	 * // ... process data ...
	 * const duration = timer.stop();
	 * console.log(`Processing completed in ${duration}ms`);
	 */
	stop() {
		if ( this.stopTime === -1 ) {
			this.stopTime = this.now();
			this.updateMessage("Timer '"+this.name+"' stopped at "+this.stopTime+". Time elapsed: "+this.elapsed()+" ms");
		}
		return this.elapsed();
	};

	/**
	 * Gets the amount of time elapsed between the start and stop of the timer.
	 * If the timer is still running, returns the time between start and now().
	 * If the timer is stopped, returns the time between start and stop.
	 * 
	 * @returns {number} Elapsed time in milliseconds
	 * @example
	 * const timer = new Timer('operation', true);
	 * // ... perform operation ...
	 * console.log(`Current elapsed: ${timer.elapsed()}ms`);
	 * timer.stop();
	 * console.log(`Final elapsed: ${timer.elapsed()}ms`);
	 */
	elapsed() {
		return ((this.isRunning()) ? this.now() : this.stopTime ) - this.startTime;
	};

	/**
	 * Gets the amount of time elapsed between the start of the timer and now().
	 * Even if the timer is stopped, this value will continue to increase during execution.
	 * Use elapsed() to get the amount of time between start and stop.
	 * 
	 * @returns {number} Time in milliseconds since the timer was started
	 * @example
	 * const timer = new Timer('longOperation', true);
	 * // ... perform operation ...
	 * timer.stop();
	 * console.log(`Time since start: ${timer.elapsedSinceStart()}ms`);
	 */
	elapsedSinceStart() {
		return (this.now() - this.startTime);
	};

	/**
	 * Gets the amount of time elapsed since the timer was stopped.
	 * This value will increase during execution after the timer is stopped.
	 * If the timer has not been stopped, returns -1.
	 * 
	 * @returns {number} Time in milliseconds since the timer was stopped, or -1 if still running
	 * @example
	 * const timer = new Timer('operation', true);
	 * timer.stop();
	 * setTimeout(() => {
	 *   console.log(`Time since stop: ${timer.elapsedSinceStop()}ms`);
	 * }, 1000);
	 */
	elapsedSinceStop() {
		return (this.isRunning() ? -1 : this.now() - this.stopTime);
	};

	/**
	 * Gets the current time in milliseconds since the Unix epoch.
	 * Equivalent to Date.now().
	 * 
	 * @returns {number} Current timestamp in milliseconds
	 * @example
	 * const timer = new Timer('test');
	 * const timestamp = timer.now();
	 * console.log(`Current time: ${timestamp}`);
	 */
	now() {
		return Date.now();
	};

	/**
	 * Checks whether the timer has been started.
	 * 
	 * @returns {boolean} True if the timer was started, false otherwise
	 * @example
	 * const timer = new Timer('operation');
	 * console.log(timer.wasStarted()); // false
	 * await timer.start();
	 * console.log(timer.wasStarted()); // true
	 */
	wasStarted() {
		return (this.startTime > 0);
	};

	/**
	 * Checks whether the timer has not been started yet.
	 * 
	 * @returns {boolean} True if timer has not yet been started, false otherwise
	 * @example
	 * const timer = new Timer('operation');
	 * console.log(timer.notStarted()); // true
	 * await timer.start();
	 * console.log(timer.notStarted()); // false
	 */
	notStarted() {
		return !(this.wasStarted());
	};

	/**
	 * Checks whether the timer is currently running.
	 * A timer is running if it has been started but not yet stopped.
	 * 
	 * @returns {boolean} True if the timer is currently running, false if not running
	 * @example
	 * const timer = new Timer('operation', true);
	 * console.log(timer.isRunning()); // true
	 * timer.stop();
	 * console.log(timer.isRunning()); // false
	 */
	isRunning() {
		return (this.wasStarted() && this.stopTime < 0);
	};

	/**
	 * Checks whether the timer has been stopped.
	 * 
	 * @returns {boolean} True if the timer was stopped, false if not stopped
	 * @example
	 * const timer = new Timer('operation', true);
	 * console.log(timer.wasStopped()); // false
	 * timer.stop();
	 * console.log(timer.wasStopped()); // true
	 */
	wasStopped() {
		return (this.wasStarted() && this.stopTime > 0);
	};

	/**
	 * Gets the current status of the timer as a string.
	 * 
	 * @returns {string} Status string: 'NOT_STARTED', 'IS_RUNNING', or 'IS_STOPPED'
	 * @example
	 * const timer = new Timer('operation');
	 * console.log(timer.status()); // 'NOT_STARTED'
	 * await timer.start();
	 * console.log(timer.status()); // 'IS_RUNNING'
	 * timer.stop();
	 * console.log(timer.status()); // 'IS_STOPPED'
	 */
	status() {
		var s = "NOT_STARTED";
		if ( this.wasStarted() ) {
			s = (this.isRunning() ? "IS_RUNNING" : "IS_STOPPED");
		}
		return s;
	};

	/**
	 * Gets the latest internal message from the timer.
	 * Messages are internal updates about the timer's status.
	 * 
	 * @returns {string} The latest message from the timer
	 * @example
	 * const timer = new Timer('operation', true);
	 * console.log(timer.message()); // "Timer 'operation' started at ..."
	 */
	message() {
		return (this.latestMessage);
	};

	/**
	 * For debugging and testing, an object of the timer may be generated
	 * to see the current values of each timer function.
	 * 
	 * @param {boolean} sendToLog Should the timer details object be sent to the console log
	 * @returns { 
	 *   {
	 * 		name: string,
	 * 		status: string,
	 * 		started: boolean,
	 * 		running: boolean,
	 * 		stopped: boolean,
	 * 		start: number,
	 * 		stop: number,
	 * 		elapsed: number,
	 * 		now: number,
	 * 		elapsedSinceStart: number,
	 * 		elapsedSinceStop: number,
	 * 		latestMessage: string
	 *   }
	 * } An object describing the state of the timer
	 */
	details(sendToLog = false) {
		var details = {
			name: this.name,
			status: this.status(),
			started: this.wasStarted(),
			running: this.isRunning(),
			stopped: this.wasStopped(),
			start: this.startTime,
			stop: this.stopTime,
			elapsed: this.elapsed(),
			now: this.now(),
			elapsedSinceStart: this.elapsedSinceStart(),
			elapsedSinceStop: this.elapsedSinceStop(),
			latestMessage: this.message()
		};

		if (sendToLog) {
			DebugAndLog.debug("Timer '"+this.name+"' details",details);
		}

		return details;
	};
};

module.exports = Timer; 