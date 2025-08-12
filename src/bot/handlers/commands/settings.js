const logger = require('../../../utils/logger');
const { createSettingsKeyboard } = require('../../utils/keyboards');

/**
 * Escape special characters for Markdown parsing
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  // Escape special Markdown characters
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

/**
 * Validate and sanitize message text before sending
 * @param {string} text - Text to validate
 * @param {string} parseMode - Parse mode (Markdown, HTML, etc.)
 * @returns {Object} - {isValid: boolean, sanitizedText: string, parseMode: string}
 */
function validateMessageText(text, parseMode = 'Markdown') {
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      sanitizedText: '',
      parseMode: null
    };
  }

  try {
    let sanitizedText = text;
    let finalParseMode = parseMode;

    if (parseMode === 'Markdown') {
      // Check for common Markdown parsing issues
      const hasUnbalancedBrackets = (text.match(/\[/g) || []).length !== (text.match(/\]/g) || []).length;
      const hasUnbalancedParens = (text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length;
      const hasUnbalancedAsterisks = (text.match(/\*/g) || []).length % 2 !== 0;
      const hasUnbalancedUnderscores = (text.match(/_/g) || []).length % 2 !== 0;

      if (hasUnbalancedBrackets || hasUnbalancedParens || hasUnbalancedAsterisks || hasUnbalancedUnderscores) {
        logger.warn('Markdown parsing issues detected, using plain text', {
          hasUnbalancedBrackets,
          hasUnbalancedParens,
          hasUnbalancedAsterisks,
          hasUnbalancedUnderscores,
          textLength: text.length
        });
        
        // Remove all markdown formatting
        sanitizedText = text
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/__/g, '')
          .replace(/_/g, '')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/`([^`]*)`/g, '$1');
        
        finalParseMode = null;
      }
    }

    // Check for byte length (Telegram has limits)
    const byteLength = Buffer.byteLength(sanitizedText, 'utf8');
    if (byteLength > 4096) {
      logger.warn('Message too long, truncating', {
        originalLength: byteLength,
        maxLength: 4096
      });
      
      // Truncate safely at character boundary
      sanitizedText = sanitizedText.substring(0, 4000) + '...';
    }

    return {
      isValid: true,
      sanitizedText: sanitizedText,
      parseMode: finalParseMode
    };

  } catch (error) {
    logger.error('Error validating message text', error, {
      textLength: text?.length,
      parseMode: parseMode
    });
    
    return {
      isValid: false,
      sanitizedText: text,
      parseMode: null
    };
  }
}

async function settingsHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    if (!user || !t) {
      logger.error('Settings handler called with invalid context', {
        hasUser: !!user,
        hasTranslation: !!t,
        userId: user?._id
      });
      
      await ctx.reply('❌ An error occurred. Please try again.');
      return;
    }
    
    // Create settings message with proper escaping
    let message = `${t('settings.title')}\n\n`;
    message += `${t('settings.current_settings')}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Safely get and escape user data
    const languageDisplay = escapeMarkdown(getLanguageDisplayName(user.language || 'ar'));
    const timezoneDisplay = escapeMarkdown(user.timezone || 'UTC');
    const defaultTime = escapeMarkdown(user.settings?.defaultReminderTime || '12:00');
    
    message += `${t('settings.language_setting', { language: languageDisplay })}\n`;
    message += `${t('settings.timezone_setting', { timezone: timezoneDisplay })}\n`;
    
    const notificationStatus = user.settings?.notifications 
      ? t('settings.notifications_enabled')
      : t('settings.notifications_disabled');
    message += `${t('settings.notifications_setting', { status: escapeMarkdown(notificationStatus) })}\n`;
    message += `${t('settings.default_time_setting', { time: defaultTime })}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━`;
    
    // Validate message before sending
    const validation = validateMessageText(message, 'Markdown');
    
    if (!validation.isValid) {
      logger.error('Settings message validation failed', {
        userId: user._id,
        messageLength: message.length
      });
      
      // Fallback to plain text version
      await sendPlainTextSettings(ctx, user, t);
      return;
    }
    
    // Create settings keyboard
    let keyboard;
    try {
      keyboard = createSettingsKeyboard(user.language);
    } catch (keyboardError) {
      logger.error('Error creating settings keyboard', keyboardError, {
        userId: user._id,
        language: user.language
      });
      keyboard = {}; // Empty keyboard as fallback
    }
    
    try {
      await ctx.reply(validation.sanitizedText, {
        parse_mode: validation.parseMode,
        ...keyboard
      });
    } catch (sendError) {
      logger.error('Error sending settings message with parse mode', sendError, {
        userId: user._id,
        parseMode: validation.parseMode,
        errorCode: sendError.code,
        errorDescription: sendError.description
      });
      
      // Retry without parse mode
      try {
        await ctx.reply(validation.sanitizedText, keyboard);
      } catch (retryError) {
        logger.error('Error sending settings message without parse mode', retryError, {
          userId: user._id
        });
        
        // Final fallback to plain text
        await sendPlainTextSettings(ctx, user, t);
      }
    }
    
    logger.userAction(user._id, 'settings_command', {
      language: user.language,
      timezone: user.timezone,
      notifications: user.settings?.notifications
    });
    
  } catch (error) {
    logger.error('Error in settings command', error, {
      userId: ctx.user?._id,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    
    try {
      await ctx.reply(ctx.t ? ctx.t('errors.general') : '❌ An error occurred. Please try again.');
    } catch (replyError) {
      logger.error('Failed to send error message in settings command', replyError, {
        userId: ctx.user?._id
      });
    }
  }
}

/**
 * Send plain text settings message as fallback
 */
async function sendPlainTextSettings(ctx, user, t) {
  try {
    let message = `${t('settings.title')}\n\n`;
    message += `${t('settings.current_settings')}\n`;
    message += `=====================\n`;
    message += `Language: ${getLanguageDisplayName(user.language || 'ar')}\n`;
    message += `Timezone: ${user.timezone || 'UTC'}\n`;
    
    const notificationStatus = user.settings?.notifications 
      ? t('settings.notifications_enabled')
      : t('settings.notifications_disabled');
    message += `Notifications: ${notificationStatus}\n`;
    message += `Default Time: ${user.settings?.defaultReminderTime || '12:00'}\n`;
    message += `=====================`;
    
    // Create simplified keyboard
    let keyboard;
    try {
      keyboard = createSettingsKeyboard(user.language);
    } catch (keyboardError) {
      logger.warn('Keyboard creation failed, sending without keyboard', {
        userId: user._id,
        error: keyboardError.message
      });
      keyboard = {};
    }
    
    await ctx.reply(message, keyboard);
    
    logger.userAction(user._id, 'settings_fallback_sent', {
      reason: 'entity_parsing_error'
    });
    
  } catch (error) {
    logger.error('Error sending plain text settings', error, {
      userId: user._id
    });
    
    // Final fallback
    await ctx.reply('Settings:\n• Language: ' + getLanguageDisplayName(user.language) + '\n• Timezone: ' + user.timezone);
  }
}

function getLanguageDisplayName(language) {
  try {
    const languages = {
      ar: 'العربية',
      en: 'English'
    };
    return languages[language] || language || 'Unknown';
  } catch (error) {
    logger.error('Error getting language display name', error, {
      language: language
    });
    return 'Unknown';
  }
}

module.exports = settingsHandler;