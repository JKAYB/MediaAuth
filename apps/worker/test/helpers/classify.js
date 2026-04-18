const { UnrecoverableError } = require("bullmq");

function isTerminal(err) {
  return err instanceof UnrecoverableError;
}

function isRetryable(err) {
  return !isTerminal(err);
}

module.exports = { isTerminal, isRetryable };
