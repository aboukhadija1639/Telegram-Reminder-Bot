const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const moment = require('moment-timezone');
const { createConfirmationKeyboard } = require('../../utils/keyboards');

async function deleteHandler(ctx) {
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
      await ctx.reply(t('delete.no_reminders'));
      return;
    }
    
    // Initialize delete session
    ctx.session.deleteData = {
      reminders: reminders.map(r => r._id.toString())
    };
    
    await showReminderSelection(ctx, reminders);
    
    logger.userAction(user._id, 'delete_command_started');
    
  } catch (error) {
    logger.error('Error in delete command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showReminderSelection(ctx, reminders) {
  const t = ctx.t;
  const user = ctx.user;
  
  let message = `${t('delete.select_reminder')}\n\n`;
  
  const buttons = [];
  reminders.forEach((reminder, index) => {
    const scheduledTime = moment(reminder.scheduledTime).tz(user.timezone);
    const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
    
    message += `${index + 1}. ${status} **${reminder.title}**\n`;
    message += `   📅 ${scheduledTime.format('YYYY-MM-DD HH:mm')}\n\n`;
    
    buttons.push([{
      text: `🗑️ ${index + 1}. ${reminder.title.substring(0, 30)}${reminder.title.length > 30 ? '...' : ''}`,
      callback_data: `delete_select_${reminder._id}`
    }]);
  });
  
  // Add cancel button
  buttons.push([{
    text: t('common.cancel'),
    callback_data: 'delete_cancel'
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
    const user = ctx.user;
    
    const reminder = await Reminder.findById(reminderId);
    if (!reminder || reminder.userId.toString() !== user._id.toString()) {
      await ctx.answerCbQuery(t('errors.not_found'));
      return;
    }
    
    const scheduledTime = moment(reminder.scheduledTime).tz(user.timezone);
    
    const message = `${t('delete.confirm_deletion')}\n\n` +
      `📋 **${reminder.title}**\n` +
      `📅 ${scheduledTime.format('YYYY-MM-DD HH:mm')}\n` +
      (reminder.message ? `💬 ${reminder.message}\n` : '') +
      `\n⚠️ ${t('delete.warning')}`;
    
    const keyboard = createConfirmationKeyboard(user.language, `delete_confirm_${reminderId}`, 'delete_cancel');
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    await ctx.answerCbQuery();
    
    logger.userAction(user._id, 'delete_reminder_selected', { reminderId });
    
  } catch (error) {
    logger.error('Error handling reminder selection for deletion', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function handleDeleteConfirmation(ctx, action, reminderId) {
  try {
    const t = ctx.t;
    const user = ctx.user;
    
    if (action === 'cancel') {
      delete ctx.session.deleteData;
      await ctx.editMessageText(t('delete.cancelled'));
      await ctx.answerCbQuery(t('common.cancelled'));
      return;
    }
    
    if (action === 'confirm') {
      const reminder = await Reminder.findById(reminderId);
      if (!reminder || reminder.userId.toString() !== user._id.toString()) {
        await ctx.answerCbQuery(t('errors.not_found'));
        return;
      }
      
      // Soft delete - mark as inactive
      reminder.isActive = false;
      reminder.deletedAt = new Date();
      await reminder.save();
      
      // Cancel from scheduler if scheduled
      const schedulerService = require('../../../services/schedulerService');
      schedulerService.cancelReminder(reminder._id);
      
      const successMessage = `✅ ${t('delete.success')}\n\n` +
        `📋 **${reminder.title}**\n` +
        `${t('delete.deleted_successfully')}`;
      
      await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
      await ctx.answerCbQuery(t('delete.success'));
      
      // Clear session
      delete ctx.session.deleteData;
      
      logger.reminderAction(reminder._id, 'deleted', user._id, {
        title: reminder.title
      });
    }
    
  } catch (error) {
    logger.error('Error handling delete confirmation', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

module.exports = deleteHandler;
module.exports.handleReminderSelection = handleReminderSelection;
module.exports.handleDeleteConfirmation = handleDeleteConfirmation;