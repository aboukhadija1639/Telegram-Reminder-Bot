const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const timeParser = require('../../../utils/timeParser');
const moment = require('moment-timezone');
const { 
  createPriorityKeyboard, 
  createRecurrenceKeyboard,
  createConfirmationKeyboard 
} = require('../../utils/keyboards');

// Reminder creation states
const REMINDER_STATES = {
  TITLE: 'title',
  TIME: 'time',
  MESSAGE: 'message',
  PRIORITY: 'priority',
  RECURRENCE: 'recurrence',
  CONFIRMATION: 'confirmation'
};

async function remindHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Check if user can create reminders
    if (!user.canCreateReminder()) {
      await ctx.reply(t('reminder.max_reminders', { max: user.settings.maxReminders }));
      return;
    }
    
    // Initialize reminder session data
    ctx.session.reminderData = {
      state: REMINDER_STATES.TITLE,
      title: null,
      message: null,
      scheduledTime: null,
      priority: 'normal',
      isRecurring: false,
      recurringPattern: null,
      timezone: user.timezone
    };
    
    // Start the reminder creation wizard
    await startReminderWizard(ctx);
    
    logger.userAction(user._id, 'remind_command_started');
    
  } catch (error) {
    logger.error('Error in remind command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function startReminderWizard(ctx) {
  const t = ctx.t;
  const user = ctx.user;
  
  const message = `${t('reminder.create_title')}\n\n` +
    `${t('reminder.wizard_step1')}\n\n` +
    `${t('reminder.title_instructions')}\n\n` +
    `${t('reminder.example_titles', { 
      examples: user.language === 'ar' 
        ? '• اجتماع مع الفريق\n• تذكير بالموعد الطبي\n• دفع الفواتير'
        : '• Team meeting\n• Doctor appointment\n• Pay bills'
    })}`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      selective: true
    }
  });
  
  logger.userAction(ctx.user._id, 'reminder_wizard_started', { step: 'title' });
}

async function handleReminderInput(ctx) {
  try {
    const reminderData = ctx.session.reminderData;
    if (!reminderData) {
      return false; // Not in reminder creation mode
    }
    
    const userInput = ctx.message.text.trim();
    const t = ctx.t;
    const user = ctx.user;
    
    switch (reminderData.state) {
      case REMINDER_STATES.TITLE:
        return await handleTitleInput(ctx, userInput);
        
      case REMINDER_STATES.TIME:
        return await handleTimeInput(ctx, userInput);
        
      case REMINDER_STATES.MESSAGE:
        return await handleMessageInput(ctx, userInput);
        
      default:
        return false;
    }
    
  } catch (error) {
    logger.error('Error handling reminder input', error, {
      userId: ctx.user?._id,
      state: ctx.session.reminderData?.state
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleTitleInput(ctx, title) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  if (!title || title.length < 3) {
    await ctx.reply(t('reminder.title_too_short'));
    return true;
  }
  
  if (title.length > 200) {
    await ctx.reply(t('reminder.title_too_long'));
    return true;
  }
  
  // Save title and move to time input
  reminderData.title = title;
  reminderData.state = REMINDER_STATES.TIME;
  
  const timeExamples = timeParser.suggestFormats(ctx.user.language);
  const examplesText = timeExamples.map(ex => `• ${ex}`).join('\n');
  
  const message = `${t('reminder.title_saved', { title })}\n\n` +
    `${t('reminder.wizard_step2')}\n\n` +
    `${t('reminder.time_instructions')}\n\n` +
    `${t('reminder.time_examples')}:\n${examplesText}`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      force_reply: true,
      selective: true
    }
  });
  
  logger.userAction(ctx.user._id, 'reminder_title_set', { title });
  return true;
}

async function handleTimeInput(ctx, timeInput) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  const user = ctx.user;
  
  // Parse the time input
  const parseResult = timeParser.parseTime(timeInput, user.language, user.timezone);
  
  if (!parseResult.success) {
    const suggestions = timeParser.suggestFormats(user.language);
    const examplesText = suggestions.slice(0, 3).map(ex => `• ${ex}`).join('\n');
    
    await ctx.reply(
      `${t('reminder.time_parse_error')}\n\n` +
      `${t('reminder.time_examples')}:\n${examplesText}\n\n` +
      `${t('reminder.error_details')}: ${parseResult.error}`
    );
    return true;
  }
  
  // Validate time is in the future
  const now = moment().tz(user.timezone);
  const scheduledTime = moment(parseResult.dateTime).tz(user.timezone);
  
  if (scheduledTime.isBefore(now.add(1, 'minute'))) {
    await ctx.reply(t('reminder.time_past_error'));
    return true;
  }
  
  // Save time and move to message input
  reminderData.scheduledTime = parseResult.dateTime;
  reminderData.state = REMINDER_STATES.MESSAGE;
  
  const formattedTime = scheduledTime.format('YYYY-MM-DD HH:mm');
  const relativeTime = scheduledTime.fromNow();
  
  const message = `${t('reminder.time_saved')}\n\n` +
    `📅 ${t('reminder.scheduled_for')}: **${formattedTime}**\n` +
    `⏰ ${t('reminder.relative_time')}: **${relativeTime}**\n\n` +
    `${t('reminder.wizard_step3')}\n\n` +
    `${t('reminder.message_instructions')}`;
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: t('reminder.skip_message'), callback_data: 'skip_message' }]
      ]
    }
  });
  
  logger.userAction(ctx.user._id, 'reminder_time_set', { 
    scheduledTime: parseResult.dateTime,
    input: timeInput 
  });
  return true;
}

async function handleMessageInput(ctx, message) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  if (message.length > 1000) {
    await ctx.reply(t('reminder.message_too_long'));
    return true;
  }
  
  // Save message and move to priority selection
  reminderData.message = message;
  await showPrioritySelection(ctx);
  
  logger.userAction(ctx.user._id, 'reminder_message_set', { messageLength: message.length });
  return true;
}

async function showPrioritySelection(ctx) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  reminderData.state = REMINDER_STATES.PRIORITY;
  
  const keyboard = createPriorityKeyboard(ctx.user.language, reminderData.priority);
  
  const message = `${t('reminder.wizard_step4')}\n\n` +
    `${t('reminder.priority_instructions')}\n\n` +
    `${t('reminder.current_reminder')}:\n` +
    `📋 **${reminderData.title}**\n` +
    `⏰ **${moment(reminderData.scheduledTime).tz(ctx.user.timezone).format('YYYY-MM-DD HH:mm')}**` +
    (reminderData.message ? `\n💬 ${reminderData.message}` : '');
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handlePriorityCallback(ctx, priority) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  if (!reminderData || reminderData.state !== REMINDER_STATES.PRIORITY) {
    await ctx.answerCbQuery(t('errors.session_expired'));
    return;
  }
  
  reminderData.priority = priority;
  await ctx.answerCbQuery(t('reminder.priority_selected', { priority: t(`reminder.priority_${priority}`) }));
  
  // Move to recurrence selection
  await showRecurrenceSelection(ctx);
  
  logger.userAction(ctx.user._id, 'reminder_priority_set', { priority });
}

async function showRecurrenceSelection(ctx) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  reminderData.state = REMINDER_STATES.RECURRENCE;
  
  const keyboard = createRecurrenceKeyboard(ctx.user.language);
  
  const message = `${t('reminder.wizard_step5')}\n\n` +
    `${t('reminder.recurrence_instructions')}`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handleRecurrenceCallback(ctx, pattern) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  if (!reminderData || reminderData.state !== REMINDER_STATES.RECURRENCE) {
    await ctx.answerCbQuery(t('errors.session_expired'));
    return;
  }
  
  if (pattern === 'no') {
    reminderData.isRecurring = false;
    reminderData.recurringPattern = null;
  } else {
    reminderData.isRecurring = true;
    reminderData.recurringPattern = pattern;
  }
  
  await ctx.answerCbQuery(t('reminder.recurrence_selected'));
  
  // Move to final confirmation
  await showFinalConfirmation(ctx);
  
  logger.userAction(ctx.user._id, 'reminder_recurrence_set', { 
    isRecurring: reminderData.isRecurring,
    pattern: reminderData.recurringPattern 
  });
}

async function showFinalConfirmation(ctx) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  const user = ctx.user;
  
  reminderData.state = REMINDER_STATES.CONFIRMATION;
  
  const scheduledTime = moment(reminderData.scheduledTime).tz(user.timezone);
  const priorityEmoji = {
    low: '🟢',
    normal: '🟡',
    high: '🟠',
    urgent: '🔴'
  };
  
  const message = `${t('reminder.wizard_final')}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 **${t('reminder.title')}**: ${reminderData.title}\n` +
    `📅 **${t('reminder.date')}**: ${scheduledTime.format('YYYY-MM-DD')}\n` +
    `⏰ **${t('reminder.time')}**: ${scheduledTime.format('HH:mm')}\n` +
    `${priorityEmoji[reminderData.priority]} **${t('reminder.priority')}**: ${t(`reminder.priority_${reminderData.priority}`)}\n` +
    `🔄 **${t('reminder.recurrence')}**: ${reminderData.isRecurring ? t(`reminder.recurring_${reminderData.recurringPattern}`) : t('reminder.recurring_no')}\n` +
    (reminderData.message ? `💬 **${t('reminder.message')}**: ${reminderData.message}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${t('reminder.confirm_create')}`;
  
  const keyboard = createConfirmationKeyboard(user.language);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handleConfirmationCallback(ctx, action) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  const user = ctx.user;
  
  if (!reminderData || reminderData.state !== REMINDER_STATES.CONFIRMATION) {
    await ctx.answerCbQuery(t('errors.session_expired'));
    return;
  }
  
  if (action === 'cancel') {
    delete ctx.session.reminderData;
    await ctx.editMessageText(t('reminder.creation_cancelled'));
    await ctx.answerCbQuery(t('common.cancelled'));
    logger.userAction(user._id, 'reminder_creation_cancelled');
    return;
  }
  
  if (action === 'confirm') {
    try {
      // Create the reminder
      const reminder = new Reminder({
        userId: user._id,
        title: reminderData.title,
        message: reminderData.message,
        scheduledTime: reminderData.scheduledTime,
        originalScheduledTime: reminderData.scheduledTime,
        priority: reminderData.priority,
        isRecurring: reminderData.isRecurring,
        recurringPattern: reminderData.recurringPattern,
        timezone: user.timezone,
        targetType: 'private',
        targetId: user.telegramId.toString()
      });
      
      await reminder.save();
      
      // Schedule the reminder
      const schedulerService = require('../../../services/schedulerService');
      await schedulerService.scheduleReminder(reminder);
      
      // Update user stats
      await user.incrementCreatedReminders();
      
      const scheduledTime = moment(reminderData.scheduledTime).tz(user.timezone);
      const successMessage = `✅ ${t('reminder.created_successfully')}\n\n` +
        `📋 ${reminderData.title}\n` +
        `⏰ ${scheduledTime.format('YYYY-MM-DD HH:mm')}\n` +
        `🔔 ${t('reminder.will_notify')} ${scheduledTime.fromNow()}`;
      
      await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery(t('reminder.created_successfully'));
      
      // Clear session data
      delete ctx.session.reminderData;
      
      logger.reminderAction(reminder._id, 'created', user._id, {
        title: reminder.title,
        scheduledTime: reminder.scheduledTime,
        priority: reminder.priority,
        isRecurring: reminder.isRecurring
      });
      
    } catch (error) {
      logger.error('Error creating reminder', error, {
        userId: user._id,
        reminderData
      });
      
      await ctx.editMessageText(t('reminder.creation_failed'));
      await ctx.answerCbQuery(t('errors.general'));
    }
  }
}

async function handleSkipMessage(ctx) {
  const t = ctx.t;
  const reminderData = ctx.session.reminderData;
  
  if (!reminderData || reminderData.state !== REMINDER_STATES.MESSAGE) {
    await ctx.answerCbQuery(t('errors.session_expired'));
    return;
  }
  
  reminderData.message = null;
  await ctx.answerCbQuery(t('reminder.message_skipped'));
  
  // Move to priority selection
  await showPrioritySelection(ctx);
  
  logger.userAction(ctx.user._id, 'reminder_message_skipped');
}

// Export functions for use in callback handlers
module.exports = remindHandler;
module.exports.handleReminderInput = handleReminderInput;
module.exports.handlePriorityCallback = handlePriorityCallback;
module.exports.handleRecurrenceCallback = handleRecurrenceCallback;
module.exports.handleConfirmationCallback = handleConfirmationCallback;
module.exports.handleSkipMessage = handleSkipMessage;
module.exports.REMINDER_STATES = REMINDER_STATES;