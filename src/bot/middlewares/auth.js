const User = require("../../database/models/User");
const logger = require("../../utils/logger");
const { translate } = require("../../config/i18n");
const mongoose = require("mongoose");

/**
 * Authentication middleware to check if user exists and is active
 */
async function authMiddleware(ctx, next) {
  const startTime = Date.now();
  
  try {
    // Validate context object
    if (!ctx) {
      logger.error("Auth middleware called with null context");
      return;
    }

    if (!ctx.from) {
      logger.error("Auth middleware called without user data", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        chatId: ctx.chat?.id,
        updateType: ctx.updateType
      });
      return;
    }

    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      logger.warn("Database not connected, waiting...", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId: ctx.from?.id,
        connectionState: mongoose.connection.readyState
      });

      // Wait for connection up to 10 seconds
      let attempts = 0;
      while (mongoose.connection.readyState !== 1 && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("Database connection failed after waiting", {
          service: "telegram-reminder-bot",
          version: "1.0.0",
          telegramId: ctx.from?.id,
          attempts: attempts,
          finalState: mongoose.connection.readyState
        });
        
        try {
          await ctx.reply("🔧 Database connection issue. Please try again in a moment.");
        } catch (replyError) {
          logger.error("Failed to send database error message", replyError, {
            service: "telegram-reminder-bot",
            version: "1.0.0",
            telegramId: ctx.from?.id
          });
        }
        return;
      }
    }

    const telegramUser = ctx.from;

    // Set default context values to prevent undefined errors
    ctx.state = ctx.state || {};
    ctx.userLang = 'ar'; // Default language
    ctx.t = (key, options) => translate('ar', key, options);

    // Find or create user
    let user = null;
    try {
      user = await User.findByTelegramId(telegramUser.id);
    } catch (dbError) {
      logger.error("Database error while finding user", dbError, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId: telegramUser.id,
        operation: "findByTelegramId"
      });
      
      // Continue with graceful degradation
      try {
        await ctx.reply("❌ Authentication error. Please try again later.");
      } catch (replyError) {
        logger.error("Failed to send auth error message", replyError, {
          service: "telegram-reminder-bot",
          version: "1.0.0"
        });
      }
      return;
    }

    if (!user) {
      try {
        const isAdmin = isUserAdmin(telegramUser.id);

        // Create new user with validation
        const userData = {
          telegramId: telegramUser.id,
          username: telegramUser.username || null,
          firstName: telegramUser.first_name || 'Unknown',
          lastName: telegramUser.last_name || null,
          language: telegramUser.language_code === "ar" ? "ar" : "en",
          isAdmin: isAdmin,
        };

        user = new User(userData);
        await user.save();
        
        if (isAdmin) {
          logger.adminAction(user._id, "admin_user_registered", null, {
            service: "telegram-reminder-bot",
            version: "1.0.0",
            telegramId: user.telegramId,
          });
        }
        
        logger.userAction(user._id, "user_registered", {
          service: "telegram-reminder-bot",
          version: "1.0.0",
          username: user.username,
          firstName: user.firstName,
          language: user.language,
        });
      } catch (createError) {
        logger.error("Error creating new user", createError, {
          service: "telegram-reminder-bot",
          version: "1.0.0",
          telegramId: telegramUser.id,
          userData: {
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            language: telegramUser.language_code
          }
        });
        
        // Set default user context to prevent further errors
        ctx.user = {
          _id: null,
          telegramId: telegramUser.id,
          language: telegramUser.language_code === "ar" ? "ar" : "en",
          isAdmin: false,
          isBanned: false,
          isActive: true,
          settings: { notifications: true }
        };
        ctx.userLang = ctx.user.language;
        ctx.t = (key, options) => translate(ctx.user.language, key, options);
        
        try {
          await ctx.reply("⚠️ Registration issue. Some features may be limited.");
        } catch (replyError) {
          logger.error("Failed to send registration warning", replyError);
        }
        
        await next();
        return;
      }
    } else {
      try {
        // Check if admin status changed for existing users
        const shouldBeAdmin = isUserAdmin(user.telegramId);
        if (user.isAdmin !== shouldBeAdmin) {
          user.isAdmin = shouldBeAdmin;
          await user.save();

          logger.userAction(user._id, "admin_status_updated", {
            service: "telegram-reminder-bot",
            version: "1.0.0",
            oldStatus: !shouldBeAdmin,
            newStatus: shouldBeAdmin,
          });
        }
        
        // Update user info if changed
        let hasChanges = false;

        if (user.username !== telegramUser.username) {
          user.username = telegramUser.username;
          hasChanges = true;
        }

        if (user.firstName !== telegramUser.first_name) {
          user.firstName = telegramUser.first_name || 'Unknown';
          hasChanges = true;
        }

        if (user.lastName !== telegramUser.last_name) {
          user.lastName = telegramUser.last_name;
          hasChanges = true;
        }

        if (hasChanges) {
          await user.save();
          logger.userAction(user._id, "user_info_updated", {
            service: "telegram-reminder-bot",
            version: "1.0.0",
            changes: {
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
            },
          });
        }

        // Update last active
        try {
          await user.updateLastActive();
        } catch (updateError) {
          logger.warn("Failed to update last active", updateError, {
            userId: user._id,
            service: "telegram-reminder-bot"
          });
          // Continue anyway, this is not critical
        }
      } catch (updateError) {
        logger.error("Error updating existing user", updateError, {
          service: "telegram-reminder-bot",
          version: "1.0.0",
          userId: user._id,
          telegramId: user.telegramId
        });
        // Continue with existing user data
      }
    }

    // Validate user object
    if (!user || !user._id) {
      logger.error("Invalid user object after authentication", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId: telegramUser.id,
        userExists: !!user,
        userId: user?._id
      });
      
      // Set fallback user context
      ctx.user = {
        _id: null,
        telegramId: telegramUser.id,
        language: telegramUser.language_code === "ar" ? "ar" : "en",
        isAdmin: false,
        isBanned: false,
        isActive: true,
        settings: { notifications: true }
      };
      ctx.userLang = ctx.user.language;
      ctx.t = (key, options) => translate(ctx.user.language, key, options);
      
      await next();
      return;
    }

    // Check if user is banned
    if (user.isBanned) {
      const t = (key, options) => translate(user.language, key, options);
      const banMessage = t("errors.banned", { reason: user.banReason || "No reason provided" });
      
      try {
        await ctx.reply(banMessage);
      } catch (replyError) {
        logger.error("Failed to send ban message", replyError, {
          userId: user._id,
          service: "telegram-reminder-bot"
        });
      }

      logger.security("Banned user access attempt", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        userId: user._id,
        telegramId: user.telegramId,
        reason: user.banReason,
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      logger.security("Inactive user access attempt", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        userId: user._id,
        telegramId: user.telegramId,
      });
      return;
    }

    // Attach user to context with fallback values
    ctx.user = user;
    ctx.userLang = user.language || 'ar';
    ctx.t = (key, options) => translate(user.language || 'ar', key, options);

    const duration = Date.now() - startTime;
    const isNewUser = !user.lastActive || user.createdAt > (Date.now() - 5000);
    
    logger.performance("auth_middleware", duration, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      userId: user._id,
      isNewUser: isNewUser,
    });

    await next();
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Ensure error object is properly handled
    const errorInfo = {
      message: error?.message || 'Unknown error',
      stack: error?.stack || null,
      name: error?.name || 'UnknownError',
      code: error?.code || null
    };
    
    logger.error("Auth middleware error", error, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      telegramId: ctx.from?.id,
      chatId: ctx.chat?.id,
      duration: `${duration}ms`,
      errorInfo: errorInfo
    });

    // Set default context to prevent downstream errors
    if (!ctx.user) {
      ctx.user = {
        _id: null,
        telegramId: ctx.from?.id || null,
        language: 'ar',
        isAdmin: false,
        isBanned: false,
        isActive: true,
        settings: { notifications: true }
      };
    }
    
    if (!ctx.userLang) {
      ctx.userLang = ctx.user.language || 'ar';
    }
    
    if (!ctx.t) {
      ctx.t = (key, options) => translate(ctx.userLang || 'ar', key, options);
    }

    // Send generic error message
    try {
      await ctx.reply("❌ Authentication error. Please try again.");
    } catch (replyError) {
      logger.error("Failed to send auth error message", replyError, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        originalError: errorInfo
      });
    }
    
    // Continue to next middleware with default context
    await next();
  }
}

// Helper function to check admin status
function isUserAdmin(telegramId) {
  try {
    const adminIds = process.env.ADMIN_IDS?.split(",").map((id) => id.trim()) || [];
    return adminIds.includes(telegramId.toString());
  } catch (error) {
    logger.error("Error checking admin status", error, {
      telegramId: telegramId
    });
    return false;
  }
}

// Rate limiting for failed admin attempts
const adminAttempts = new Map();

/**
 * Admin authentication middleware
 */
async function adminMiddleware(ctx, next) {
  try {
    // Validate context
    if (!ctx || !ctx.from) {
      logger.error("Admin middleware called with invalid context", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        hasContext: !!ctx,
        hasFrom: !!ctx?.from
      });
      return;
    }

    const telegramId = ctx.from.id;

    // Check rate limiting for this user
    const attempts = adminAttempts.get(telegramId) || {
      count: 0,
      lastAttempt: 0,
    };
    const now = Date.now();

    // Reset counter if more than 10 minutes passed
    if (now - attempts.lastAttempt > 10 * 60 * 1000) {
      attempts.count = 0;
    }

    // Block if too many attempts
    if (attempts.count >= 5) {
      const waitTime = Math.ceil(
        (10 * 60 * 1000 - (now - attempts.lastAttempt)) / 1000 / 60
      );
      
      const errorMessage = ctx.t ? 
        ctx.t("errors.tooManyAttempts", { minutes: waitTime }) :
        `❌ Too many attempts. Wait ${waitTime} minutes.`;
      
      try {
        await ctx.reply(errorMessage);
      } catch (replyError) {
        logger.error("Failed to send rate limit message", replyError, {
          telegramId: telegramId
        });
      }

      logger.security("Admin rate limit exceeded", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId,
        attempts: attempts.count,
        waitTime,
      });
      return;
    }

    // Check if user exists in context
    if (!ctx.user) {
      logger.security("Admin access attempt without user context", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId,
      });
      return;
    }

    // Check if user is admin
    if (!ctx.user.isAdmin) {
      // Increment failed attempts
      attempts.count++;
      attempts.lastAttempt = now;
      adminAttempts.set(telegramId, attempts);

      const errorMessage = ctx.t ? ctx.t("errors.permission") : "❌ Admin permission required";
      
      try {
        await ctx.reply(errorMessage);
      } catch (replyError) {
        logger.error("Failed to send permission error", replyError, {
          telegramId: telegramId
        });
      }

      logger.security("Unauthorized admin access attempt", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        userId: ctx.user._id,
        telegramId: ctx.user.telegramId,
        command: ctx.message?.text || ctx.callbackQuery?.data,
        attempts: attempts.count,
        username: ctx.user.username,
      });
      return;
    }

    // Reset attempts on successful admin access
    adminAttempts.delete(telegramId);

    logger.adminAction(ctx.user._id, "admin_command_access", null, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      command: ctx.message?.text || ctx.callbackQuery?.data,
      username: ctx.user.username,
    });

    await next();
  } catch (error) {
    const errorInfo = {
      message: error?.message || 'Unknown admin middleware error',
      stack: error?.stack || null,
      name: error?.name || 'AdminMiddlewareError'
    };

    logger.error("Admin middleware error", error, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      userId: ctx.user?._id,
      telegramId: ctx.from?.id,
      errorInfo: errorInfo
    });

    try {
      const errorMessage = ctx.t ? ctx.t("errors.general") : "❌ An error occurred";
      await ctx.reply(errorMessage);
    } catch (replyError) {
      logger.error("Failed to send admin error message", replyError, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        originalError: errorInfo
      });
    }
  }
}

/**
 * Rate limiting middleware
 */
function createRateLimitMiddleware(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 30,
    keyGenerator = (ctx) => ctx.from.id.toString(),
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  const requestCounts = new Map();

  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
      if (now - data.resetTime > windowMs) {
        requestCounts.delete(key);
      }
    }
  }, windowMs);

  return async function rateLimitMiddleware(ctx, next) {
    try {
      const key = keyGenerator(ctx);
      const now = Date.now();

      let requestData = requestCounts.get(key);

      if (!requestData || now - requestData.resetTime > windowMs) {
        requestData = {
          count: 0,
          resetTime: now,
        };
        requestCounts.set(key, requestData);
      }

      requestData.count++;

      if (requestData.count > maxRequests) {
        const errorMessage = ctx.t
          ? ctx.t("errors.rate_limit")
          : "❌ Rate limit exceeded. Please wait a moment";
        await ctx.reply(errorMessage);

        logger.rateLimitHit(ctx.user?._id || ctx.from?.id, ctx.message?.text, {
          service: "telegram-reminder-bot",
          version: "1.0.0",
          count: requestData.count,
          limit: maxRequests,
          windowMs,
        });

        return;
      }

      await next();
    } catch (error) {
      logger.error("Rate limit middleware error", error, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        userId: ctx.user?._id,
        telegramId: ctx.from?.id,
      });

      // Continue to next middleware even if rate limiting fails
      await next();
    }
  };
}

/**
 * Maintenance mode middleware
 */
function maintenanceMiddleware(ctx, next) {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";

  if (isMaintenanceMode) {
    // Allow admins to use bot during maintenance
    if (ctx.user && ctx.user.isAdmin) {
      return next();
    }

    const errorMessage = ctx.t
      ? ctx.t("errors.maintenance")
      : "🔧 Bot is under maintenance. Please try later";
    return ctx.reply(errorMessage);
  }

  return next();
}

/**
 * Language detection middleware
 */
async function languageMiddleware(ctx, next) {
  try {
    // Skip if user is already set
    if (ctx.userLang) {
      return next();
    }

    // Detect language from Telegram user
    const telegramUser = ctx.from;
    let detectedLang = "ar"; // Default to Arabic

    if (telegramUser?.language_code) {
      if (telegramUser.language_code.startsWith("ar")) {
        detectedLang = "ar";
      } else if (telegramUser.language_code.startsWith("en")) {
        detectedLang = "en";
      }
    }

    ctx.userLang = detectedLang;
    ctx.t = (key, options) => translate(detectedLang, key, options);

    await next();
  } catch (error) {
    logger.error("Language middleware error", error, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
    });
    ctx.userLang = "ar";
    ctx.t = (key, options) => translate("ar", key, options);
    await next();
  }
}

/**
 * Error handling middleware
 */
function errorMiddleware() {
  return async function (ctx, next) {
    try {
      await next();
    } catch (error) {
      logger.error("Bot error", error, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        userId: ctx.user?._id,
        telegramId: ctx.from?.id,
        chatId: ctx.chat?.id,
        messageText: ctx.message?.text,
        updateType: ctx.updateType,
      });

      // Send user-friendly error message
      try {
        const errorMessage = ctx.t
          ? ctx.t("errors.general")
          : "❌ An error occurred. Please try again later";
        await ctx.reply(errorMessage);
      } catch (replyError) {
        logger.error("Failed to send error message to user", replyError, {
          service: "telegram-reminder-bot",
          version: "1.0.0",
        });
      }
    }
  };
}

/**
 * Logging middleware
 */
function loggingMiddleware() {
  return async function (ctx, next) {
    const startTime = Date.now();

    // Log incoming update
    logger.debug("Incoming update", {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      updateType: ctx.updateType,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      messageText: ctx.message?.text,
      callbackData: ctx.callbackQuery?.data,
    });

    await next();

    // Log processing time
    const duration = Date.now() - startTime;
    logger.performance("update_processing", duration, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      updateType: ctx.updateType,
      userId: ctx.user?._id,
    });
  };
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  createRateLimitMiddleware,
  maintenanceMiddleware,
  languageMiddleware,
  errorMiddleware,
  loggingMiddleware,
};