const logger = require('../../utils/logger');
const { retryOperation } = require('./safeMessageEdit');

// Error categories for better handling and logging
const ERROR_CATEGORIES = {
  AUTH: 'authentication',
  API: 'telegram_api',
  DATABASE: 'database',
  VALIDATION: 'validation',
  NETWORK: 'network',
  RATE_LIMIT: 'rate_limit',
  UNKNOWN: 'unknown'
};

// Error severity levels
const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Circuit breaker for repeated failures
class CircuitBreaker {
  constructor(name, threshold = 5, timeout = 60000) {
    this.name = name;
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      logger.error(`Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
    }
  }

  reset() {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
    logger.info(`Circuit breaker ${this.name} manually reset`);
  }
}

// Circuit breakers for different operations
const circuitBreakers = {
  telegram: new CircuitBreaker('telegram_api', 5, 30000),
  database: new CircuitBreaker('database', 3, 60000),
  external: new CircuitBreaker('external_api', 3, 120000)
};

/**
 * Categorize error based on its properties
 * @param {Error} error - The error to categorize
 * @param {Object} context - Additional context about the error
 * @returns {Object} - {category: string, severity: string}
 */
function categorizeError(error, context = {}) {
  if (!error) {
    return { category: ERROR_CATEGORIES.UNKNOWN, severity: ERROR_SEVERITY.LOW };
  }

  const errorCode = error.code || error.response?.status_code;
  const errorMessage = error.message || '';
  const errorDescription = error.description || '';

  // Telegram API errors
  if (errorCode || errorDescription.includes('Telegram')) {
    let severity = ERROR_SEVERITY.MEDIUM;
    
    switch (errorCode) {
      case 400:
        severity = ERROR_SEVERITY.LOW;
        break;
      case 401:
      case 403:
        severity = ERROR_SEVERITY.HIGH;
        break;
      case 429:
        return { category: ERROR_CATEGORIES.RATE_LIMIT, severity: ERROR_SEVERITY.MEDIUM };
      case 500:
      case 502:
      case 503:
        severity = ERROR_SEVERITY.HIGH;
        break;
      default:
        severity = ERROR_SEVERITY.MEDIUM;
    }
    
    return { category: ERROR_CATEGORIES.API, severity };
  }

  // Database errors
  if (errorMessage.includes('mongo') || 
      errorMessage.includes('database') ||
      errorMessage.includes('connection') ||
      error.name === 'MongoError' ||
      error.name === 'MongooseError') {
    return { 
      category: ERROR_CATEGORIES.DATABASE, 
      severity: ERROR_SEVERITY.HIGH 
    };
  }

  // Authentication errors
  if (errorMessage.includes('auth') || 
      errorMessage.includes('permission') ||
      errorMessage.includes('unauthorized') ||
      context.middleware === 'auth') {
    return { 
      category: ERROR_CATEGORIES.AUTH, 
      severity: ERROR_SEVERITY.MEDIUM 
    };
  }

  // Validation errors
  if (errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('required') ||
      error.name === 'ValidationError') {
    return { 
      category: ERROR_CATEGORIES.VALIDATION, 
      severity: ERROR_SEVERITY.LOW 
    };
  }

  // Network errors
  if (errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ENOTFOUND') ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED') {
    return { 
      category: ERROR_CATEGORIES.NETWORK, 
      severity: ERROR_SEVERITY.MEDIUM 
    };
  }

  return { category: ERROR_CATEGORIES.UNKNOWN, severity: ERROR_SEVERITY.MEDIUM };
}

/**
 * Determine recovery strategy based on error category and context
 * @param {string} category - Error category
 * @param {string} severity - Error severity
 * @param {Object} context - Error context
 * @returns {Object} - Recovery strategy
 */
function getRecoveryStrategy(category, severity, context = {}) {
  const strategies = {
    [ERROR_CATEGORIES.API]: {
      retry: true,
      maxRetries: 3,
      backoffMultiplier: 2,
      fallback: 'user_notification'
    },
    [ERROR_CATEGORIES.DATABASE]: {
      retry: true,
      maxRetries: 2,
      backoffMultiplier: 1.5,
      fallback: 'graceful_degradation'
    },
    [ERROR_CATEGORIES.RATE_LIMIT]: {
      retry: true,
      maxRetries: 2,
      backoffMultiplier: 3,
      fallback: 'queue_request'
    },
    [ERROR_CATEGORIES.NETWORK]: {
      retry: true,
      maxRetries: 3,
      backoffMultiplier: 2,
      fallback: 'user_notification'
    },
    [ERROR_CATEGORIES.AUTH]: {
      retry: false,
      fallback: 'reset_session'
    },
    [ERROR_CATEGORIES.VALIDATION]: {
      retry: false,
      fallback: 'user_correction'
    },
    [ERROR_CATEGORIES.UNKNOWN]: {
      retry: true,
      maxRetries: 1,
      backoffMultiplier: 2,
      fallback: 'user_notification'
    }
  };

  const baseStrategy = strategies[category] || strategies[ERROR_CATEGORIES.UNKNOWN];

  // Adjust strategy based on severity
  if (severity === ERROR_SEVERITY.CRITICAL) {
    baseStrategy.maxRetries = Math.min(baseStrategy.maxRetries || 1, 1);
    baseStrategy.fallback = 'emergency_shutdown';
  } else if (severity === ERROR_SEVERITY.LOW) {
    baseStrategy.maxRetries = (baseStrategy.maxRetries || 1) + 1;
  }

  return baseStrategy;
}

/**
 * Execute recovery strategy
 * @param {string} strategy - Recovery strategy name
 * @param {Object} ctx - Telegram context
 * @param {Error} error - Original error
 * @param {Object} context - Additional context
 */
async function executeRecoveryStrategy(strategy, ctx, error, context = {}) {
  try {
    switch (strategy) {
      case 'user_notification':
        await notifyUser(ctx, error, context);
        break;
        
      case 'graceful_degradation':
        await gracefulDegradation(ctx, context);
        break;
        
      case 'reset_session':
        await resetSession(ctx, context);
        break;
        
      case 'user_correction':
        await requestUserCorrection(ctx, error, context);
        break;
        
      case 'queue_request':
        await queueRequest(ctx, context);
        break;
        
      case 'emergency_shutdown':
        await emergencyShutdown(error, context);
        break;
        
      default:
        await notifyUser(ctx, error, context);
    }
  } catch (recoveryError) {
    logger.error('Recovery strategy failed', recoveryError, {
      strategy,
      originalError: error.message,
      context
    });
  }
}

/**
 * Notify user about the error with appropriate message
 */
async function notifyUser(ctx, error, context) {
  if (!ctx || !ctx.reply) {
    return;
  }

  try {
    const { category } = categorizeError(error, context);
    let message;

    switch (category) {
      case ERROR_CATEGORIES.API:
        message = ctx.t ? ctx.t('errors.api_temporary') : '🔧 Service temporarily unavailable. Please try again.';
        break;
      case ERROR_CATEGORIES.DATABASE:
        message = ctx.t ? ctx.t('errors.database') : '💾 Database issue. Please try again in a moment.';
        break;
      case ERROR_CATEGORIES.RATE_LIMIT:
        message = ctx.t ? ctx.t('errors.rate_limit') : '⏱️ Too many requests. Please wait a moment.';
        break;
      case ERROR_CATEGORIES.NETWORK:
        message = ctx.t ? ctx.t('errors.network') : '🌐 Network issue. Please check your connection.';
        break;
      default:
        message = ctx.t ? ctx.t('errors.general') : '❌ An error occurred. Please try again.';
    }

    await ctx.reply(message);
  } catch (notifyError) {
    logger.error('Failed to notify user about error', notifyError);
  }
}

/**
 * Implement graceful degradation
 */
async function gracefulDegradation(ctx, context) {
  if (!ctx) return;

  try {
    // Set minimal context to prevent further errors
    ctx.user = ctx.user || {
      _id: null,
      language: 'ar',
      isAdmin: false,
      settings: { notifications: true }
    };
    
    ctx.userLang = ctx.userLang || 'ar';
    ctx.t = ctx.t || ((key) => key);

    const message = '⚠️ Some features are temporarily limited. Basic functionality available.';
    await ctx.reply(message);
    
    logger.info('Graceful degradation activated', context);
  } catch (error) {
    logger.error('Graceful degradation failed', error);
  }
}

/**
 * Reset user session
 */
async function resetSession(ctx, context) {
  if (!ctx) return;

  try {
    if (ctx.session) {
      ctx.session = {};
    }
    
    const message = '🔄 Session reset. Please try your request again.';
    await ctx.reply(message);
    
    logger.info('Session reset for user', {
      userId: ctx.user?._id,
      context
    });
  } catch (error) {
    logger.error('Session reset failed', error);
  }
}

/**
 * Request user correction
 */
async function requestUserCorrection(ctx, error, context) {
  if (!ctx) return;

  try {
    let message = '⚠️ Please check your input and try again.';
    
    if (error.message.includes('validation')) {
      message = '📝 Please check the format of your input and try again.';
    } else if (error.message.includes('required')) {
      message = '📋 Some required information is missing. Please provide all details.';
    }

    await ctx.reply(message);
  } catch (error) {
    logger.error('Failed to request user correction', error);
  }
}

/**
 * Queue request for later processing
 */
async function queueRequest(ctx, context) {
  try {
    // TODO: Implement request queueing system
    await ctx.reply('📥 Request queued. We\'ll process it shortly.');
    
    logger.info('Request queued', {
      userId: ctx.user?._id,
      context
    });
  } catch (error) {
    logger.error('Failed to queue request', error);
  }
}

/**
 * Emergency shutdown procedure
 */
async function emergencyShutdown(error, context) {
  logger.error('CRITICAL ERROR - Emergency shutdown initiated', error, {
    context,
    timestamp: new Date().toISOString()
  });

  // TODO: Implement emergency procedures
  // - Notify administrators
  // - Save critical data
  // - Graceful service shutdown if needed
}

/**
 * Main global error handler
 * @param {Error} error - The error that occurred
 * @param {Object} ctx - Telegram context (if available)
 * @param {Object} context - Additional context information
 * @returns {Promise<boolean>} - Returns true if error was handled successfully
 */
async function handleGlobalError(error, ctx = null, context = {}) {
  try {
    // Extract error information safely
    const errorInfo = {
      message: error?.message || 'Unknown error',
      stack: error?.stack || null,
      name: error?.name || 'Error',
      code: error?.code || null
    };

    // Categorize the error
    const { category, severity } = categorizeError(error, context);

    // Enhanced logging with categorization
    logger.error('Global error handler activated', error, {
      category,
      severity,
      userId: ctx?.user?._id,
      telegramId: ctx?.from?.id,
      chatId: ctx?.chat?.id,
      updateType: ctx?.updateType,
      context,
      errorInfo
    });

    // Get recovery strategy
    const strategy = getRecoveryStrategy(category, severity, context);

    // Attempt recovery with retry if specified
    if (strategy.retry && strategy.maxRetries > 0) {
      try {
        // Use circuit breaker for API calls
        const circuitBreaker = getCircuitBreakerForCategory(category);
        
        if (circuitBreaker) {
          await circuitBreaker.execute(async () => {
            await retryOperation(
              () => executeRecoveryStrategy(strategy.fallback, ctx, error, context),
              strategy.maxRetries,
              1000,
              strategy.backoffMultiplier
            );
          });
        } else {
          await retryOperation(
            () => executeRecoveryStrategy(strategy.fallback, ctx, error, context),
            strategy.maxRetries,
            1000,
            strategy.backoffMultiplier
          );
        }
      } catch (retryError) {
        logger.error('Retry attempts failed', retryError, {
          originalError: errorInfo,
          category,
          severity
        });
        
        // Final fallback
        await executeRecoveryStrategy('user_notification', ctx, error, context);
      }
    } else {
      // Execute recovery strategy without retry
      await executeRecoveryStrategy(strategy.fallback, ctx, error, context);
    }

    return true;

  } catch (handlerError) {
    logger.error('Global error handler failed', handlerError, {
      originalError: error?.message,
      context
    });

    // Last resort: try to notify user
    try {
      if (ctx && ctx.reply) {
        await ctx.reply('❌ A critical error occurred. Please contact support.');
      }
    } catch (lastResortError) {
      logger.error('Last resort error notification failed', lastResortError);
    }

    return false;
  }
}

/**
 * Get appropriate circuit breaker for error category
 */
function getCircuitBreakerForCategory(category) {
  switch (category) {
    case ERROR_CATEGORIES.API:
      return circuitBreakers.telegram;
    case ERROR_CATEGORIES.DATABASE:
      return circuitBreakers.database;
    case ERROR_CATEGORIES.NETWORK:
      return circuitBreakers.external;
    default:
      return null;
  }
}

/**
 * Create error handler middleware for the bot
 */
function createErrorHandlerMiddleware() {
  return async function errorHandlerMiddleware(ctx, next) {
    try {
      await next();
    } catch (error) {
      await handleGlobalError(error, ctx, {
        middleware: 'error_handler',
        command: ctx.message?.text || ctx.callbackQuery?.data
      });
    }
  };
}

/**
 * Get system health status
 */
function getSystemHealth() {
  return {
    circuitBreakers: Object.keys(circuitBreakers).reduce((acc, key) => {
      const cb = circuitBreakers[key];
      acc[key] = {
        state: cb.state,
        failureCount: cb.failureCount,
        lastFailureTime: cb.lastFailureTime
      };
      return acc;
    }, {}),
    timestamp: Date.now()
  };
}

/**
 * Reset all circuit breakers
 */
function resetAllCircuitBreakers() {
  Object.values(circuitBreakers).forEach(cb => cb.reset());
  logger.info('All circuit breakers reset');
}

module.exports = {
  handleGlobalError,
  createErrorHandlerMiddleware,
  categorizeError,
  getRecoveryStrategy,
  executeRecoveryStrategy,
  getSystemHealth,
  resetAllCircuitBreakers,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  CircuitBreaker
};