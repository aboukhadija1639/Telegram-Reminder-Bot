const logger = require('../../utils/logger');

// Session storage for tracking last message content to prevent unnecessary edits
const messageCache = new Map();

/**
 * Safely edit a message text with conflict prevention and error handling
 * @param {Object} ctx - Telegram context object
 * @param {string} newText - New message text
 * @param {Object} options - Message options (reply_markup, parse_mode, etc.)
 * @param {boolean} forceEdit - Force edit even if content appears same
 * @returns {Promise<boolean>} - Returns true if edit was successful, false otherwise
 */
async function safeEditMessageText(ctx, newText, options = {}, forceEdit = false) {
  try {
    // Validate inputs
    if (!ctx) {
      logger.error('safeEditMessageText called with null context');
      return false;
    }

    if (!newText || typeof newText !== 'string') {
      logger.error('safeEditMessageText called with invalid text', {
        userId: ctx.user?._id,
        textType: typeof newText,
        textLength: newText?.length
      });
      return false;
    }

    const currentMessage = ctx.callbackQuery?.message || ctx.message;
    if (!currentMessage) {
      logger.error('safeEditMessageText called without message context', {
        userId: ctx.user?._id,
        hasCallbackQuery: !!ctx.callbackQuery,
        hasMessage: !!ctx.message
      });
      return false;
    }

    const messageId = currentMessage.message_id;
    const chatId = currentMessage.chat.id;
    const cacheKey = `${chatId}_${messageId}`;

    // Get cached content for comparison
    const cachedContent = messageCache.get(cacheKey);
    const currentText = currentMessage.text || '';
    const currentMarkup = currentMessage.reply_markup || {};

    // Normalize text for comparison (remove extra whitespace)
    const normalizedNewText = newText.trim().replace(/\s+/g, ' ');
    const normalizedCurrentText = currentText.trim().replace(/\s+/g, ' ');
    const normalizedCachedText = cachedContent?.text?.trim().replace(/\s+/g, ' ') || '';

    // Check if content is actually different
    const isTextDifferent = normalizedNewText !== normalizedCurrentText && 
                           normalizedNewText !== normalizedCachedText;
    const isMarkupDifferent = options.reply_markup && 
                             JSON.stringify(options.reply_markup) !== JSON.stringify(currentMarkup);

    if (!forceEdit && !isTextDifferent && !isMarkupDifferent) {
      logger.debug('Message content identical, skipping edit', {
        userId: ctx.user?._id,
        messageId: messageId,
        textLength: newText.length
      });
      
      // Update cache with current content
      messageCache.set(cacheKey, {
        text: newText,
        markup: options.reply_markup || currentMarkup,
        lastUpdated: Date.now()
      });
      
      return true;
    }

    // Prepare edit options
    const editOptions = {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      ...options
    };

    // Attempt to edit the message
    try {
      if (ctx.telegram) {
        await ctx.telegram.editMessageText(
          editOptions.chat_id,
          editOptions.message_id,
          undefined,
          editOptions.text,
          editOptions
        );
      } else if (ctx.editMessageText) {
        await ctx.editMessageText(newText, options);
      } else {
        throw new Error('No edit method available');
      }

      // Update cache on successful edit
      messageCache.set(cacheKey, {
        text: newText,
        markup: options.reply_markup || currentMarkup,
        lastUpdated: Date.now()
      });

      logger.debug('Message edited successfully', {
        userId: ctx.user?._id,
        messageId: messageId,
        textLength: newText.length
      });

      return true;

    } catch (editError) {
      return await handleEditError(ctx, editError, newText, options, cacheKey);
    }

  } catch (error) {
    logger.error('Unexpected error in safeEditMessageText', error, {
      userId: ctx.user?._id,
      textLength: newText?.length,
      errorMessage: error?.message
    });
    return false;
  }
}

/**
 * Handle edit errors with appropriate fallback strategies
 */
async function handleEditError(ctx, error, newText, options, cacheKey) {
  const userId = ctx.user?._id;
  const errorCode = error.code || error.response?.status_code;
  const errorDescription = error.description || error.message;

  // Handle specific Telegram API errors
  switch (errorCode) {
    case 400:
      if (errorDescription?.includes('message is not modified')) {
        logger.debug('Message content identical (API level)', {
          userId: userId,
          textLength: newText.length
        });
        
        // Update cache to prevent future unnecessary attempts
        messageCache.set(cacheKey, {
          text: newText,
          markup: options.reply_markup,
          lastUpdated: Date.now()
        });
        
        return true;
      } else if (errorDescription?.includes('message to edit not found')) {
        logger.warn('Message to edit not found', {
          userId: userId,
          errorDescription: errorDescription
        });
        return await fallbackToReply(ctx, newText, options);
      } else if (errorDescription?.includes('can\'t parse entities')) {
        logger.warn('Entity parsing error, trying without parse_mode', {
          userId: userId,
          parseMode: options.parse_mode,
          textLength: newText.length
        });
        
        // Retry without parse_mode
        const optionsWithoutParse = { ...options };
        delete optionsWithoutParse.parse_mode;
        
        try {
          if (ctx.editMessageText) {
            await ctx.editMessageText(newText, optionsWithoutParse);
          }
          return true;
        } catch (retryError) {
          logger.error('Retry without parse_mode failed', retryError, {
            userId: userId
          });
          return await fallbackToReply(ctx, newText, optionsWithoutParse);
        }
      }
      break;

    case 403:
      logger.error('Edit forbidden - bot may be blocked', error, {
        userId: userId,
        errorDescription: errorDescription
      });
      return false;

    case 429:
      // Rate limited - implement retry with backoff
      const retryAfter = error.parameters?.retry_after || 1;
      logger.warn('Rate limited, retrying after delay', {
        userId: userId,
        retryAfter: retryAfter
      });
      
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return await safeEditMessageText(ctx, newText, options, true);

    default:
      logger.error('Edit message error', error, {
        userId: userId,
        errorCode: errorCode,
        errorDescription: errorDescription,
        textLength: newText.length
      });
  }

  // Fallback to sending new message
  return await fallbackToReply(ctx, newText, options);
}

/**
 * Fallback to sending a new message when edit fails
 */
async function fallbackToReply(ctx, text, options) {
  try {
    logger.debug('Using fallback reply method', {
      userId: ctx.user?._id,
      textLength: text.length
    });

    await ctx.reply(text, options);
    return true;
  } catch (replyError) {
    logger.error('Fallback reply also failed', replyError, {
      userId: ctx.user?._id,
      textLength: text.length
    });
    return false;
  }
}

/**
 * Safely answer callback query with error handling
 * @param {Object} ctx - Telegram context object
 * @param {string} text - Callback answer text (optional)
 * @param {Object} options - Callback answer options
 * @returns {Promise<boolean>} - Returns true if successful, false otherwise
 */
async function safeAnswerCallbackQuery(ctx, text = '', options = {}) {
  try {
    if (!ctx || !ctx.answerCbQuery) {
      logger.error('safeAnswerCallbackQuery called with invalid context', {
        userId: ctx?.user?._id,
        hasContext: !!ctx,
        hasAnswerMethod: !!ctx?.answerCbQuery
      });
      return false;
    }

    if (!ctx.callbackQuery) {
      logger.debug('No callback query to answer', {
        userId: ctx.user?._id
      });
      return true; // Not an error, just nothing to answer
    }

    await ctx.answerCbQuery(text, options);
    return true;

  } catch (error) {
    const errorCode = error.code || error.response?.status_code;
    
    // Handle specific errors
    if (errorCode === 400 && error.description?.includes('query is too old')) {
      logger.debug('Callback query too old to answer', {
        userId: ctx.user?._id
      });
      return true; // Not a critical error
    }

    logger.error('Failed to answer callback query', error, {
      userId: ctx.user?._id,
      errorCode: errorCode,
      errorDescription: error.description || error.message,
      callbackData: ctx.callbackQuery?.data
    });
    
    return false;
  }
}

/**
 * Clear old cache entries to prevent memory leaks
 */
function cleanupMessageCache() {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  let removedCount = 0;
  for (const [key, value] of messageCache.entries()) {
    if (now - value.lastUpdated > maxAge) {
      messageCache.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    logger.debug('Cleaned up message cache', {
      removedEntries: removedCount,
      remainingEntries: messageCache.size
    });
  }
}

// Cleanup cache every 30 minutes
setInterval(cleanupMessageCache, 30 * 60 * 1000);

/**
 * Retry mechanism for failed operations
 * @param {Function} operation - Function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {number} backoffMultiplier - Backoff multiplier for exponential backoff
 * @returns {Promise<any>} - Returns the result of the operation
 */
async function retryOperation(operation, maxRetries = 3, initialDelay = 1000, backoffMultiplier = 2) {
  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain error types
      const errorCode = error.code || error.response?.status_code;
      if (errorCode === 403 || errorCode === 400) {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, {
        error: error.message,
        errorCode: errorCode,
        nextDelay: delay
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Safe wrapper for any Telegram API call with retry logic
 * @param {Function} apiCall - The API call function
 * @param {Object} context - Context for logging
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>} - Returns the API call result
 */
async function safeTelegramApiCall(apiCall, context = {}, maxRetries = 3) {
  return await retryOperation(
    async () => {
      try {
        return await apiCall();
      } catch (error) {
        logger.telegramError(error, context);
        throw error;
      }
    },
    maxRetries
  );
}

module.exports = {
  safeEditMessageText,
  safeAnswerCallbackQuery,
  safeTelegramApiCall,
  retryOperation,
  cleanupMessageCache
};