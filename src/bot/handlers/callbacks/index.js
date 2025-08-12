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
      case 'list':
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
      
      case 'skip':
        await handleSkipCallback(ctx, params[0]);
        break;
      
      case 'complete':
        await handleCompleteCallback(ctx, params[0]);
        break;
      
      case 'snooze':
        await handleSnoozeCallback(ctx, params[0]);
        break;
      
      case 'delete':
        if (params.length > 1 && params[0] === 'select') {
          // Delete command selection
          const deleteModule = require('../commands/delete');
          await deleteModule.handleReminderSelection(ctx, params[1]);
        } else if (params.length > 1 && params[0] === 'confirm') {
          // Delete confirmation
          const deleteModule = require('../commands/delete');
          await deleteModule.handleDeleteConfirmation(ctx, 'confirm', params[1]);
        } else if (params[0] === 'cancel') {
          // Delete cancellation
          const deleteModule = require('../commands/delete');
          await deleteModule.handleDeleteConfirmation(ctx, 'cancel', null);
        } else {
          // Original delete callback for reminder notifications
          await handleDeleteCallback(ctx, params[0]);
        }
        break;
      
      case 'edit':
        await handleEditCallback(ctx, params);
        break;
      
      case 'broadcast':
        await handleBroadcastCallback(ctx, params[0]);
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
    const { handlePriorityCallback: remindHandlePriority } = require('../commands/remind');
    await remindHandlePriority(ctx, priority);
    
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
    const { handleRecurrenceCallback: remindHandleRecurrence } = require('../commands/remind');
    await remindHandleRecurrence(ctx, pattern);
    
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
    const { handleConfirmationCallback } = require('../commands/remind');
    await handleConfirmationCallback(ctx, action);
    
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

async function handleSkipCallback(ctx, action) {
  try {
    if (action === 'message') {
      const { handleSkipMessage } = require('../commands/remind');
      await handleSkipMessage(ctx);
    } else {
      await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
    }
    
  } catch (error) {
    logger.error('Error handling skip callback', error, {
      userId: ctx.user?._id,
      action: action
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleEditCallback(ctx, params) {
  try {
    const editModule = require('../commands/edit');
    const action = params[0];
    
    switch (action) {
      case 'select':
        await editModule.handleReminderSelection(ctx, params[1]);
        break;
      case 'field':
        await editModule.handleFieldSelection(ctx, params[1]);
        break;
      case 'confirm':
      case 'cancel':
        await editModule.handleEditConfirmation(ctx, action);
        break;
      case 'priority':
        await editModule.handleEditPriorityCallback(ctx, params[1]);
        break;
      case 'recurrence':
        await editModule.handleEditRecurrenceCallback(ctx, params[1]);
        break;
      default:
        await safeAnswerCallbackQuery(ctx, ctx.t('errors.not_found'));
    }
    
  } catch (error) {
    logger.error('Error handling edit callback', error, {
      userId: ctx.user?._id,
      params: params
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

async function handleBroadcastCallback(ctx, action) {
  try {
    const { handleBroadcastConfirmation } = require('../commands/broadcast');
    await handleBroadcastConfirmation(ctx, action);
    
  } catch (error) {
    logger.error('Error handling broadcast callback', error, {
      userId: ctx.user?._id,
      action: action
    });
    await safeAnswerCallbackQuery(ctx, ctx.t('errors.general'));
  }
}

module.exports = callbackHandler;