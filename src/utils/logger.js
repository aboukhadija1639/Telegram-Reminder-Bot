const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${stack || ''} ${metaStr}`;
  })
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'telegram-reminder-bot',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10
    }),
    
    // Daily rotating logs
    new winston.transports.File({
      filename: path.join(logsDir, 'daily.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 7,
      tailable: true
    })
  ],
  
  // Exception handling
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Rejection handling
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Custom logging methods
class Logger {
  static info(message, meta = {}) {
    logger.info(message, meta);
  }
  
  static error(message, error = null, meta = {}) {
    const errorMeta = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...meta
    } : meta;
    
    logger.error(message, errorMeta);
  }
  
  static warn(message, meta = {}) {
    logger.warn(message, meta);
  }
  
  static debug(message, meta = {}) {
    logger.debug(message, meta);
  }
  
  static verbose(message, meta = {}) {
    logger.verbose(message, meta);
  }
  
  // Bot-specific logging methods
  static userAction(userId, action, details = {}) {
    logger.info('User Action', {
      userId,
      action,
      details,
      category: 'user_action'
    });
  }
  
  static reminderAction(reminderId, action, userId, details = {}) {
    logger.info('Reminder Action', {
      reminderId,
      userId,
      action,
      details,
      category: 'reminder_action'
    });
  }
  
  static adminAction(adminId, action, targetId = null, details = {}) {
    logger.warn('Admin Action', {
      adminId,
      action,
      targetId,
      details,
      category: 'admin_action'
    });
  }
  
  static botEvent(event, details = {}) {
    logger.info('Bot Event', {
      event,
      details,
      category: 'bot_event'
    });
  }
  
  static databaseAction(action, collection, details = {}) {
    logger.debug('Database Action', {
      action,
      collection,
      details,
      category: 'database'
    });
  }
  
  static performance(action, duration, details = {}) {
    logger.info('Performance Metric', {
      action,
      duration: `${duration}ms`,
      details,
      category: 'performance'
    });
  }
  
  static security(event, details = {}) {
    logger.warn('Security Event', {
      event,
      details,
      category: 'security'
    });
  }
  
  static rateLimitHit(userId, endpoint, details = {}) {
    logger.warn('Rate Limit Hit', {
      userId,
      endpoint,
      details,
      category: 'rate_limit'
    });
  }
  
  static telegramError(error, context = {}) {
    logger.error('Telegram API Error', error, {
      context,
      category: 'telegram_api'
    });
  }
  
  static cronJob(jobName, status, details = {}) {
    logger.info('Cron Job', {
      jobName,
      status,
      details,
      category: 'cron'
    });
  }
  
  static middleware(middlewareName, userId, details = {}) {
    logger.debug('Middleware', {
      middlewareName,
      userId,
      details,
      category: 'middleware'
    });
  }
  
  // Helper method to log API requests
  static apiRequest(method, endpoint, statusCode, duration, userId = null) {
    logger.info('API Request', {
      method,
      endpoint,
      statusCode,
      duration: `${duration}ms`,
      userId,
      category: 'api'
    });
  }
  
  // Helper method to log database queries
  static dbQuery(operation, collection, duration, resultCount = null) {
    logger.debug('Database Query', {
      operation,
      collection,
      duration: `${duration}ms`,
      resultCount,
      category: 'database_query'
    });
  }
  
  // Method to get recent logs
  static getRecentLogs(level = 'error', limit = 100) {
    return new Promise((resolve, reject) => {
      const options = {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        until: new Date(),
        limit,
        start: 0,
        order: 'desc',
        fields: ['timestamp', 'level', 'message']
      };
      
      logger.query(options, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }
  
  // Method to clear old logs
  static clearOldLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const logFiles = [
      'error.log',
      'combined.log',
      'daily.log',
      'exceptions.log',
      'rejections.log'
    ];
    
    logFiles.forEach(filename => {
      const filepath = path.join(logsDir, filename);
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filepath);
          logger.info(`Cleared old log file: ${filename}`);
        }
      }
    });
  }
  
  // Method to get log statistics
  static async getLogStats() {
    try {
      const errorLogs = await this.getRecentLogs('error', 1000);
      const warnLogs = await this.getRecentLogs('warn', 1000);
      const infoLogs = await this.getRecentLogs('info', 1000);
      
      return {
        errors: errorLogs.length,
        warnings: warnLogs.length,
        info: infoLogs.length,
        total: errorLogs.length + warnLogs.length + infoLogs.length
      };
    } catch (error) {
      logger.error('Error getting log statistics:', error);
      return { errors: 0, warnings: 0, info: 0, total: 0 };
    }
  }
  
  // Method to format error for logging
  static formatError(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      syscall: error.syscall,
      hostname: error.hostname,
      address: error.address,
      port: error.port
    };
  }
  
  // Method to create request ID for tracking
  static generateRequestId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Export both the winston logger and our custom Logger class
module.exports = Logger;
module.exports.winston = logger;