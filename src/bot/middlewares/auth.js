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
    // Check database connection first
    if (mongoose.connection.readyState !== 1) {
      logger.warn("Database not connected, waiting...", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
        telegramId: ctx.from?.id,
      });

      // Wait for connection up to 10 seconds
      let attempts = 0;
      while (mongoose.connection.readyState !== 1 && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (mongoose.connection.readyState !== 1) {
        await ctx.reply(
          "🔧 Database connection issue. Please try again in a moment."
        );
        return;
      }
    }

    const telegramUser = ctx.from;

    if (!telegramUser) {
      logger.security("Unauthorized access attempt - no user data", {
        service: "telegram-reminder-bot",
        version: "1.0.0",
      });
      return;
    }

    // Find or create user
    let user = await User.findByTelegramId(telegramUser.id);

    if (!user) {
      const isAdmin = isUserAdmin(telegramUser.id);

      // Create new user
      user = new User({
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        language: telegramUser.language_code === "ar" ? "ar" : "en",
        isAdmin: isAdmin,
      });

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
    } else {
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
        user.firstName = telegramUser.first_name;
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
      await user.updateLastActive();
    }

    // Check if user is banned
    if (user.isBanned) {
      const t = (key, options) => translate(user.language, key, options);
      await ctx.reply(
        t("errors.banned", { reason: user.banReason || "No reason provided" })
      );

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

    // Attach user to context
    ctx.user = user;
    ctx.userLang = user.language;
    ctx.t = (key, options) => translate(user.language, key, options);

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
    
    logger.error("Auth middleware error", error, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      telegramId: ctx.from?.id,
      chatId: ctx.chat?.id,
      duration: `${duration}ms`,
    });

    // Send generic error message
    try {
      await ctx.reply("❌ Authentication error. Please try again.");
    } catch (replyError) {
      logger.error("Failed to send auth error message", replyError, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
      });
    }
  }
}

// Helper function to check admin status
function isUserAdmin(telegramId) {
  const adminIds =
    process.env.ADMIN_IDS?.split(",").map((id) => id.trim()) || [];
  return adminIds.includes(telegramId.toString());
}

// Rate limiting for failed admin attempts
const adminAttempts = new Map();

/**
 * Admin authentication middleware
 */
async function adminMiddleware(ctx, next) {
  try {
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
      await ctx.reply(ctx.t("errors.tooManyAttempts", { minutes: waitTime }));

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

      const errorMessage = ctx.t("errors.permission");
      await ctx.reply(errorMessage);

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
    logger.error("Admin middleware error", error, {
      service: "telegram-reminder-bot",
      version: "1.0.0",
      userId: ctx.user?._id,
      telegramId: ctx.from?.id,
    });

    try {
      await ctx.reply(ctx.t("errors.general"));
    } catch (replyError) {
      logger.error("Failed to send admin error message", replyError, {
        service: "telegram-reminder-bot",
        version: "1.0.0",
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