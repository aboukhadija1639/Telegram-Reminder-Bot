const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const timeParser = require('../../../utils/timeParser');
const moment = require('moment-timezone');
const { 
  createPriorityKeyboard, 
  createRecurrenceKeyboard,
  createConfirmationKeyboard,
  createPaginationKeyboard
} = require('../../utils/keyboards');

// Edit states
const EDIT_STATES = {
  SELECTION: 'selection',
  FIELD: 'field',
  VALUE: 'value',
  CONFIRMATION: 'confirmation'
};

async function editHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Get user's reminders
    const reminders = await Reminder.find({
      userId: user._id,
      isActive: true,
      isCompleted: false
    })
    .sort({ scheduledTime: 1 })
    .limit(10);
    
    if (reminders.length === 0) {
      await ctx.reply(t('edit.no_reminders'));
      return;
    }
    
    // Initialize edit session
    ctx.session.editData = {
      state: EDIT_STATES.SELECTION,
      reminders: reminders.map(r => r._id.toString()),
      selectedReminder: null,
      field: null,
      newValue: null
    };
    
    await showReminderSelection(ctx, reminders);
    
    logger.userAction(user._id, 'edit_command_started');
    
  } catch (error) {
    logger.error('Error in edit command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showReminderSelection(ctx, reminders) {
  const t = ctx.t;
  const user = ctx.user;
  
  let message = `${t('edit.select_reminder')}\n\n`;
  
  const buttons = [];
  reminders.forEach((reminder, index) => {
    const scheduledTime = moment(reminder.scheduledTime).tz(user.timezone);
    const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
    
    message += `${index + 1}. ${status} **${reminder.title}**\n`;
    message += `   📅 ${scheduledTime.format('YYYY-MM-DD HH:mm')}\n\n`;
    
    buttons.push([{
      text: `${index + 1}. ${reminder.title.substring(0, 30)}${reminder.title.length > 30 ? '...' : ''}`,
      callback_data: `edit_select_${reminder._id}`
    }]);
  });
  
  // Add cancel button
  buttons.push([{
    text: t('common.cancel'),
    callback_data: 'edit_cancel'
  }]);
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

async function handleReminderSelection(ctx, reminderId) {
  try {
    const t = ctx.t;
    const editData = ctx.session.editData;
    
    if (!editData || editData.state !== EDIT_STATES.SELECTION) {
      await ctx.answerCbQuery(t('errors.session_expired'));
      return;
    }
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder || reminder.userId.toString() !== ctx.user._id.toString()) {
      await ctx.answerCbQuery(t('errors.not_found'));
      return;
    }
    
    editData.selectedReminder = reminderId;
    editData.state = EDIT_STATES.FIELD;
    
    await showFieldSelection(ctx, reminder);
    await ctx.answerCbQuery();
    
    logger.userAction(ctx.user._id, 'edit_reminder_selected', { reminderId });
    
  } catch (error) {
    logger.error('Error handling reminder selection', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function showFieldSelection(ctx, reminder) {
  const t = ctx.t;
  const user = ctx.user;
  
  const scheduledTime = moment(reminder.scheduledTime).tz(user.timezone);
  
  const message = `${t('edit.selected_reminder')}:\n\n` +
    `📋 **${reminder.title}**\n` +
    `📅 ${scheduledTime.format('YYYY-MM-DD HH:mm')}\n` +
    `🔔 ${reminder.priority} ${t('reminder.priority')}\n` +
    `🔄 ${reminder.isRecurring ? t(`reminder.recurring_${reminder.recurringPattern}`) : t('reminder.recurring_no')}\n` +
    (reminder.message ? `💬 ${reminder.message}\n` : '') +
    `\n${t('edit.select_field')}`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: `📋 ${t('reminder.title')}`, callback_data: 'edit_field_title' }],
      [{ text: `⏰ ${t('reminder.time')}`, callback_data: 'edit_field_time' }],
      [{ text: `💬 ${t('reminder.message')}`, callback_data: 'edit_field_message' }],
      [{ text: `🔔 ${t('reminder.priority')}`, callback_data: 'edit_field_priority' }],
      [{ text: `🔄 ${t('reminder.recurrence')}`, callback_data: 'edit_field_recurrence' }],
      [{ text: t('common.back'), callback_data: 'edit_back' }],
      [{ text: t('common.cancel'), callback_data: 'edit_cancel' }]
    ]
  };
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function handleFieldSelection(ctx, field) {
  try {
    const t = ctx.t;
    const editData = ctx.session.editData;
    
    if (!editData || editData.state !== EDIT_STATES.FIELD) {
      await ctx.answerCbQuery(t('errors.session_expired'));
      return;
    }
    
    const reminder = await Reminder.findById(editData.selectedReminder);
    if (!reminder) {
      await ctx.answerCbQuery(t('errors.not_found'));
      return;
    }
    
    editData.field = field;
    
    if (field === 'priority') {
      await showPriorityEditor(ctx, reminder);
    } else if (field === 'recurrence') {
      await showRecurrenceEditor(ctx, reminder);
    } else {
      editData.state = EDIT_STATES.VALUE;
      await showValueInput(ctx, reminder, field);
    }
    
    await ctx.answerCbQuery();
    
    logger.userAction(ctx.user._id, 'edit_field_selected', { 
      reminderId: editData.selectedReminder,
      field 
    });
    
  } catch (error) {
    logger.error('Error handling field selection', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function showValueInput(ctx, reminder, field) {
  const t = ctx.t;
  
  let message = `${t('edit.current_value')}:\n`;
  let currentValue = '';
  let instructions = '';
  
  switch (field) {
    case 'title':
      currentValue = reminder.title;
      instructions = t('edit.title_instructions');
      break;
    case 'time':
      currentValue = moment(reminder.scheduledTime).tz(ctx.user.timezone).format('YYYY-MM-DD HH:mm');
      instructions = t('edit.time_instructions');
      break;
    case 'message':
      currentValue = reminder.message || t('edit.no_message');
      instructions = t('edit.message_instructions');
      break;
  }
  
  message += `**${currentValue}**\n\n${instructions}`;
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: t('common.cancel'), callback_data: 'edit_cancel' }]
      ],
      force_reply: true
    }
  });
}

async function showPriorityEditor(ctx, reminder) {
  const t = ctx.t;
  
  const message = `${t('edit.current_priority')}: ${t(`reminder.priority_${reminder.priority}`)}\n\n` +
    `${t('edit.select_new_priority')}`;
  
  const keyboard = createPriorityKeyboard(ctx.user.language, reminder.priority);
  
  // Modify callback data for edit context
  keyboard.reply_markup.inline_keyboard.forEach(row => {
    row.forEach(button => {
      button.callback_data = button.callback_data.replace('priority_', 'edit_priority_');
    });
  });
  
  // Add cancel button
  keyboard.reply_markup.inline_keyboard.push([{
    text: t('common.cancel'),
    callback_data: 'edit_cancel'
  }]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function showRecurrenceEditor(ctx, reminder) {
  const t = ctx.t;
  
  const currentRecurrence = reminder.isRecurring 
    ? t(`reminder.recurring_${reminder.recurringPattern}`)
    : t('reminder.recurring_no');
  
  const message = `${t('edit.current_recurrence')}: ${currentRecurrence}\n\n` +
    `${t('edit.select_new_recurrence')}`;
  
  const keyboard = createRecurrenceKeyboard(ctx.user.language);
  
  // Modify callback data for edit context
  keyboard.reply_markup.inline_keyboard.forEach(row => {
    row.forEach(button => {
      button.callback_data = button.callback_data.replace('recurrence_', 'edit_recurrence_');
    });
  });
  
  // Add cancel button
  keyboard.reply_markup.inline_keyboard.push([{
    text: t('common.cancel'),
    callback_data: 'edit_cancel'
  }]);
  
  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handleEditInput(ctx) {
  try {
    const editData = ctx.session.editData;
    if (!editData || editData.state !== EDIT_STATES.VALUE) {
      return false; // Not in edit mode
    }
    
    const userInput = ctx.message.text.trim();
    const t = ctx.t;
    
    const reminder = await Reminder.findById(editData.selectedReminder);
    if (!reminder) {
      await ctx.reply(t('errors.not_found'));
      return true;
    }
    
    // Validate and process input based on field
    const validation = await validateEditInput(editData.field, userInput, ctx.user, t);
    if (!validation.success) {
      await ctx.reply(validation.error);
      return true;
    }
    
    editData.newValue = validation.value;
    editData.state = EDIT_STATES.CONFIRMATION;
    
    await showEditConfirmation(ctx, reminder);
    
    logger.userAction(ctx.user._id, 'edit_value_entered', {
      reminderId: editData.selectedReminder,
      field: editData.field,
      newValue: editData.newValue
    });
    
    return true;
    
  } catch (error) {
    logger.error('Error handling edit input', error);
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function validateEditInput(field, input, user, t) {
  switch (field) {
    case 'title':
      if (!input || input.length < 3) {
        return { success: false, error: t('reminder.title_too_short') };
      }
      if (input.length > 200) {
        return { success: false, error: t('reminder.title_too_long') };
      }
      return { success: true, value: input };
      
    case 'time':
      const parseResult = timeParser.parseTime(input, user.language, user.timezone);
      if (!parseResult.success) {
        return { success: false, error: t('reminder.time_parse_error') + ': ' + parseResult.error };
      }
      
      const now = moment().tz(user.timezone);
      const scheduledTime = moment(parseResult.dateTime).tz(user.timezone);
      
      if (scheduledTime.isBefore(now.add(1, 'minute'))) {
        return { success: false, error: t('reminder.time_past_error') };
      }
      
      return { success: true, value: parseResult.dateTime };
      
    case 'message':
      if (input.length > 1000) {
        return { success: false, error: t('reminder.message_too_long') };
      }
      return { success: true, value: input };
      
    default:
      return { success: false, error: t('errors.invalid_field') };
  }
}

async function showEditConfirmation(ctx, reminder) {
  const t = ctx.t;
  const editData = ctx.session.editData;
  const user = ctx.user;
  
  let currentValue = '';
  let newValue = '';
  
  switch (editData.field) {
    case 'title':
      currentValue = reminder.title;
      newValue = editData.newValue;
      break;
    case 'time':
      currentValue = moment(reminder.scheduledTime).tz(user.timezone).format('YYYY-MM-DD HH:mm');
      newValue = moment(editData.newValue).tz(user.timezone).format('YYYY-MM-DD HH:mm');
      break;
    case 'message':
      currentValue = reminder.message || t('edit.no_message');
      newValue = editData.newValue;
      break;
  }
  
  const message = `${t('edit.confirm_changes')}\n\n` +
    `📋 **${reminder.title}**\n\n` +
    `${t('edit.field')}: **${t(`reminder.${editData.field}`)}**\n` +
    `${t('edit.current')}: ${currentValue}\n` +
    `${t('edit.new')}: **${newValue}**\n\n` +
    `${t('edit.confirm_question')}`;
  
  const keyboard = createConfirmationKeyboard(user.language, 'edit_confirm', 'edit_cancel');
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handleEditConfirmation(ctx, action) {
  try {
    const t = ctx.t;
    const editData = ctx.session.editData;
    const user = ctx.user;
    
    if (!editData || editData.state !== EDIT_STATES.CONFIRMATION) {
      await ctx.answerCbQuery(t('errors.session_expired'));
      return;
    }
    
    if (action === 'cancel') {
      delete ctx.session.editData;
      await ctx.editMessageText(t('edit.cancelled'));
      await ctx.answerCbQuery(t('common.cancelled'));
      return;
    }
    
    if (action === 'confirm') {
      const reminder = await Reminder.findById(editData.selectedReminder);
      if (!reminder) {
        await ctx.answerCbQuery(t('errors.not_found'));
        return;
      }
      
      // Apply the change
      const oldValue = reminder[editData.field];
      reminder[editData.field] = editData.newValue;
      reminder.updatedAt = new Date();
      
      await reminder.save();
      
      const successMessage = `✅ ${t('edit.success')}\n\n` +
        `📋 **${reminder.title}**\n` +
        `${t('edit.field')}: **${t(`reminder.${editData.field}`)}**\n` +
        `${t('edit.updated_successfully')}`;
      
      await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery(t('edit.success'));
      
      // Clear session
      delete ctx.session.editData;
      
      logger.reminderAction(reminder._id, 'edited', user._id, {
        field: editData.field,
        oldValue,
        newValue: editData.newValue
      });
    }
    
  } catch (error) {
    logger.error('Error handling edit confirmation', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function handleEditPriorityCallback(ctx, priority) {
  const editData = ctx.session.editData;
  if (!editData) {
    await ctx.answerCbQuery(ctx.t('errors.session_expired'));
    return;
  }
  
  editData.newValue = priority;
  editData.state = EDIT_STATES.CONFIRMATION;
  
  const reminder = await Reminder.findById(editData.selectedReminder);
  await showEditConfirmation(ctx, reminder);
  await ctx.answerCbQuery();
}

async function handleEditRecurrenceCallback(ctx, pattern) {
  const editData = ctx.session.editData;
  if (!editData) {
    await ctx.answerCbQuery(ctx.t('errors.session_expired'));
    return;
  }
  
  if (pattern === 'no') {
    editData.newValue = { isRecurring: false, recurringPattern: null };
  } else {
    editData.newValue = { isRecurring: true, recurringPattern: pattern };
  }
  
  editData.state = EDIT_STATES.CONFIRMATION;
  
  const reminder = await Reminder.findById(editData.selectedReminder);
  await showEditConfirmation(ctx, reminder);
  await ctx.answerCbQuery();
}

module.exports = editHandler;
module.exports.handleReminderSelection = handleReminderSelection;
module.exports.handleFieldSelection = handleFieldSelection;
module.exports.handleEditInput = handleEditInput;
module.exports.handleEditConfirmation = handleEditConfirmation;
module.exports.handleEditPriorityCallback = handleEditPriorityCallback;
module.exports.handleEditRecurrenceCallback = handleEditRecurrenceCallback;
module.exports.EDIT_STATES = EDIT_STATES;