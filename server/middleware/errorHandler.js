const crypto = require('crypto');

class AppError extends Error {
  constructor(message, statusCode = 500, { code = 'INTERNAL_ERROR', retryable = false } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function requestIdMiddleware(req, res, next) {
  req.requestId = crypto.randomUUID();
  next();
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const retryable = err.retryable || false;

  // Structured JSON log for Cloud Run -> Cloud Logging
  const logEntry = {
    severity: statusCode >= 500 ? 'ERROR' : 'WARNING',
    message: err.message,
    uid: req.user?.uid || null,
    path: req.originalUrl,
    method: req.method,
    requestId: req.requestId || null,
    statusCode,
    code,
    ...(statusCode >= 500 && { stack: err.stack }),
  };
  console.error(JSON.stringify(logEntry));

  if (!res.headersSent) {
    res.status(statusCode).json({
      error: err.message,
      code,
      retryable,
      requestId: req.requestId || null,
    });
  }
}

module.exports = { AppError, asyncHandler, requestIdMiddleware, errorHandler };
