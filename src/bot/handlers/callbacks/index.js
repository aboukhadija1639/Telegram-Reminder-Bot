const logger = require('../../../utils/logger');
const { translate } = require('../../../config/i18n');
const { safeEditMessageText, safeAnswerCallbackQuery } = require('../../utils/safeMessageEdit');

async function callbackHandler(ctx) {
  try {
    const callbackData = ctx.callbackQuery.data;
    const user = ctx.user;
    
    if (!callbackData) {
      await safeAnswerCallbackQuery(ctx);
      return;
    }
    
    logger.userAction(user._id, 'callback_query', { data: callbackData });
    
    // Parse callback data
    const [action, ...params] = callbackData.split('_');
    
    switch (action) {
      case 'lang':
        await handleLanguageCallback(ctx, params[0]);
        break;
      
      case 'tz':
        await handleTimezoneCallback(ctx, params.join('_'));
        break;
      
      case 'page':
        await handlePageCallback(ctx, params[0]);
        break;
      
      case 'help':
        await handleHelpCallback(ctx, params[0]);
        break;
      
      case 'settings':
        await handleSettingsCallback(ctx, params[0]);
        break;
      
      case 'priority':
        await handlePriorityCallback(ctx, params[0]);
        break;
      
      case 'recurrence':
        await handleRecurrenceCallback(ctx, params[0]);
        break;
      
      case 'confirm':
        await handleConfirmCallback(ctx, params[0]);
        break;
      
      case 'complete':
        await handleCompleteCallback(ctx, params[0]);
        break;
      
      case 'snooze':
        await handleSnoozeCallback(ctx, params[0]);
        break;
      
      case 'delete':
        await handleDeleteCallback(ctx, params[0]);
        break;
      
      default:
        logger.warn('Unknown callback action', { action, params, userId: user._id });
        await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
    }
    
  } catch (error) {
    logger.error('Error in callback handler', error, {
      userId: ctx.user?._id,
      callbackData: ctx.callbackQuery?.data,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleLanguageCallback(ctx, languageCode) {
  try {
    const user = ctx.user;
    
    if (languageCode === user.language) {
      await safeAnswerCallbackQuery(ctx);
      return;
    }
    
    // Update user language
    user.language = languageCode;
    await user.save();
    
    // Update context
    ctx.userLang = languageCode;
    ctx.t = (key, options) => translate(languageCode, key, options);
    
    const message = ctx.t('registration.language_set');
    
    const editSuccess = await safeEditMessageText(ctx, message);
    if (!editSuccess) {
      await ctx.reply(message);
    }
    
    await safeAnswerCallbackQuery(ctx, ctx.t('common.success'));
    
    logger.userAction(user._id, 'language_changed', { 
      from: user.language, 
      to: languageCode 
    });
    
  } catch (error) {
    logger.error('Error handling language callback', error, {
      userId: ctx.user?._id,
      languageCode: languageCode
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleTimezoneCallback(ctx, timezone) {
  try {
    const user = ctx.user;
    
    if (timezone === user.timezone) {
      await safeAnswerCallbackQuery(ctx);
      return;
    }
    
    // Update user timezone
    user.timezone = timezone;
    await user.save();
    
    const message = ctx.t('timezone.timezone_updated', { timezone });
    
    const editSuccess = await safeEditMessageText(ctx, message);
    if (!editSuccess) {
      await ctx.reply(message);
    }
    
    await safeAnswerCallbackQuery(ctx, ctx.t('common.success'));
    
    logger.userAction(user._id, 'timezone_changed', { 
      from: user.timezone, 
      to: timezone 
    });
    
  } catch (error) {
    logger.error('Error handling timezone callback', error, {
      userId: ctx.user?._id,
      timezone: timezone
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handlePageCallback(ctx, page) {
  try {
    // Handle pagination for lists
    const { handleListPagination } = require('../commands/list');
    await handleListPagination(ctx, page);
    
    await safeAnswerCallbackQuery(ctx);
    
  } catch (error) {
    logger.error('Error handling page callback', error, {
      userId: ctx.user?._id,
      page: page
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleHelpCallback(ctx, section) {
  try {
    const { handleHelpCallback } = require('../commands/help');
    await handleHelpCallback(ctx, section);
    
    await safeAnswerCallbackQuery(ctx);
    
  } catch (error) {
    logger.error('Error handling help callback', error, {
      userId: ctx.user?._id,
      section: section
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleSettingsCallback(ctx, setting) {
  try {
    const user = ctx.user;
    
    switch (setting) {
      case 'language':
        const { createLanguageKeyboard } = require('../../utils/keyboards');
        const langKeyboard = createLanguageKeyboard(user.language);
        await safeEditMessageText(
          ctx,
          ctx.t('registration.choose_language'),
          langKeyboard
        );
        break;
        
      case 'timezone':
        const { createTimezoneKeyboard } = require('../../utils/keyboards');
        const tzKeyboard = createTimezoneKeyboard(user.language, user.timezone);
        await safeEditMessageText(
          ctx,
          ctx.t('timezone.select_timezone'),
          tzKeyboard
        );
        break;
        
      case 'notifications':
        user.settings.notifications = !user.settings.notifications;
        await user.save();
        
        const status = user.settings.notifications 
          ? ctx.t('settings.notifications_enabled')
          : ctx.t('settings.notifications_disabled');
        
        await safeAnswerCallbackQuery(
          ctx,
          ctx.t('settings.notifications_toggled')
        );
        break;
        
      default:
        await safeAnswerCallbackQuery(ctx, '🚧 Feature coming soon...');
    }
    
    logger.userAction(user._id, 'settings_callback', { setting });
    
  } catch (error) {
    logger.error('Error handling settings callback', error, {
      userId: ctx.user?._id,
      setting: setting
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handlePriorityCallback(ctx, priority) {
  try {
    // Store priority in session for reminder creation
    ctx.session.reminderData = ctx.session.reminderData || {};
    ctx.session.reminderData.priority = priority;
    
    await safeAnswerCallbackQuery(ctx, ctx.t('common.success'));
    
    // TODO: Continue with reminder creation flow
    
  } catch (error) {
    logger.error('Error handling priority callback', error, {
      userId: ctx.user?._id,
      priority: priority
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleRecurrenceCallback(ctx, pattern) {
  try {
    // Store recurrence in session for reminder creation
    ctx.session.reminderData = ctx.session.reminderData || {};
    ctx.session.reminderData.recurrence = pattern;
    
    await safeAnswerCallbackQuery(ctx, ctx.t('common.success'));
    
    // TODO: Continue with reminder creation flow
    
  } catch (error) {
    logger.error('Error handling recurrence callback', error, {
      userId: ctx.user?._id,
      pattern: pattern
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleConfirmCallback(ctx, action) {
  try {
    if (action === 'yes') {
      await safeAnswerCallbackQuery(ctx, ctx.t('common.success'));
      // TODO: Execute confirmed action
    } else {
      await safeAnswerCallbackQuery(ctx, ctx.t('common.cancel'));
      // TODO: Cancel action
    }
    
  } catch (error) {
    logger.error('Error handling confirm callback', error, {
      userId: ctx.user?._id,
      action: action
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleCompleteCallback(ctx, reminderId) {
  try {
    const Reminder = require('../../../database/models/Reminder');
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder || reminder.userId.toString() !== ctx.user._id.toString()) {
      await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
      return;
    }
    
    await reminder.complete();
    
    await safeAnswerCallbackQuery(ctx, ctx.t('reminder.completed'));
    await safeEditMessageText(
      ctx,
      `✅ ${ctx.t('list.complete')}: ${reminder.title}`
    );
    
    logger.reminderAction(reminderId, 'completed_by_user', ctx.user._id);
    
  } catch (error) {
    logger.error('Error handling complete callback', error, {
      userId: ctx.user?._id,
      reminderId: reminderId
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleSnoozeCallback(ctx, reminderId) {
  try {
    const Reminder = require('../../../database/models/Reminder');
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder || reminder.userId.toString() !== ctx.user._id.toString()) {
      await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
      return;
    }
    
    await reminder.snooze(10); // Snooze for 10 minutes
    
    await safeAnswerCallbackQuery(ctx, ctx.t('list.snooze'));
    await safeEditMessageText(
      ctx,
      `⏰ ${ctx.t('list.snooze')}: ${reminder.title} (10 ${ctx.t('common.minutes')})`
    );
    
    logger.reminderAction(reminderId, 'snoozed_by_user', ctx.user._id, {
      snoozeMinutes: 10
    });
    
  } catch (error) {
    logger.error('Error handling snooze callback', error, {
      userId: ctx.user?._id,
      reminderId: reminderId
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleDeleteCallback(ctx, reminderId) {
  try {
    const Reminder = require('../../../database/models/Reminder');
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder || reminder.userId.toString() !== ctx.user._id.toString()) {
      await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
      return;
    }
    
    reminder.isActive = false;
    await reminder.save();
    
    await safeAnswerCallbackQuery(ctx, ctx.t('common.delete'));
    await safeEditMessageText(
      ctx,
      `🗑️ ${ctx.t('common.delete')}: ${reminder.title}`
    );
    
    logger.reminderAction(reminderId, 'deleted_by_user', ctx.user._id);
    
  } catch (error) {
    logger.error('Error handling delete callback', error, {
      userId: ctx.user?._id,
      reminderId: reminderId
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

module.exports = callbackHandler;