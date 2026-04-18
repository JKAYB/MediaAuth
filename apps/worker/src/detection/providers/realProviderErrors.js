const { UnrecoverableError } = require("bullmq");

/**
 * Stable `code` values for logs and support; BullMQ retries only depend on
 * `instanceof UnrecoverableError` (terminal) vs plain `Error` (retryable).
 */

/** @typedef {{ snippet?: string; httpStatus?: number }} RealProviderDebug */

class ConfigurationError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ConfigurationError";
    this.code = "REAL_CONFIG";
    this.retryable = false;
    this.debug = debug;
  }
}

class UnsupportedInputError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "UnsupportedInputError";
    this.code = "REAL_UNSUPPORTED_INPUT";
    this.retryable = false;
    this.debug = debug;
  }
}

class FileTooLargeError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "FileTooLargeError";
    this.code = "REAL_FILE_TOO_LARGE";
    this.retryable = false;
    this.debug = debug;
  }
}

class FileMissingError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "FileMissingError";
    this.code = "REAL_FILE_MISSING";
    this.retryable = false;
    this.debug = debug;
  }
}

class EmptyFileError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "EmptyFileError";
    this.code = "REAL_FILE_EMPTY";
    this.retryable = false;
    this.debug = debug;
  }
}

class ProviderAuthError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ProviderAuthError";
    this.code = "REAL_PROVIDER_AUTH";
    this.retryable = false;
    this.debug = debug;
  }
}

/** Retryable — BullMQ will retry per job options */
class ProviderRateLimitError extends Error {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ProviderRateLimitError";
    this.code = "REAL_PROVIDER_RATE_LIMIT";
    this.retryable = true;
    this.debug = debug;
  }
}

class ProviderTimeoutError extends Error {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ProviderTimeoutError";
    this.code = "REAL_PROVIDER_TIMEOUT";
    this.retryable = true;
    this.debug = debug;
  }
}

class ProviderServerError extends Error {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ProviderServerError";
    this.code = "REAL_PROVIDER_SERVER";
    this.retryable = true;
    this.debug = debug;
  }
}

class ProviderBadResponseError extends UnrecoverableError {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "ProviderBadResponseError";
    this.code = "REAL_PROVIDER_BAD_RESPONSE";
    this.retryable = false;
    this.debug = debug;
  }
}

class TemporaryProviderError extends Error {
  /** @param {string} message @param {RealProviderDebug} [debug] */
  constructor(message, debug) {
    super(message);
    this.name = "TemporaryProviderError";
    this.code = "REAL_PROVIDER_TRANSIENT";
    this.retryable = true;
    this.debug = debug;
  }
}

module.exports = {
  ConfigurationError,
  UnsupportedInputError,
  FileTooLargeError,
  FileMissingError,
  EmptyFileError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderServerError,
  ProviderBadResponseError,
  TemporaryProviderError
};
