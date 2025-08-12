const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const { formatReminderMessage, createPaginationKeyboard } = require('../../utils/keyboards');
const { formatDate, formatTime } = require('../../../config/i18n');

async function listHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const page = 1;
    const limit = 5;
    
    await sendRemindersList(ctx, user, page, limit);
    
    logger.userAction(user._id, 'list_command', { page });
    
  } catch (error) {
    logger.error('Error in list command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function sendRemindersList(ctx, user, page = 1, limit = 5) {
  try {
    const t = ctx.t;
    const skip = (page - 1) * limit;
    
    // Get user's active reminders
    const [reminders, totalCount] = await Promise.all([
      Reminder.find({
        userId: user._id,
        isActive: true,
        isCompleted: false
      })
      .sort({ scheduledTime: 1 })
      .skip(skip)
      .limit(limit),
      
      Reminder.countDocuments({
        userId: user._id,
        isActive: true,
        isCompleted: false
      })
    ]);
    
    if (totalCount === 0) {
      await ctx.reply(t('list.no_reminders'));
      return;
    }
    
    // Create message with reminders list
    let message = `${t('list.title')}\n\n`;
    
    reminders.forEach((reminder, index) => {
      const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
      const recurrence = reminder.isRecurring 
        ? ` (${t(`reminder.recurring_${reminder.recurringPattern}`)})`
        : '';
      
      message += `${index + 1}. ${status} **${reminder.title}**\n`;
      message += `   📅 ${formatDate(reminder.scheduledTime, user.language)} `;
      message += `⏰ ${formatTime(reminder.scheduledTime, user.language)}`;
      message += `${recurrence}\n\n`;
    });
    
    // Add pagination info
    const totalPages = Math.ceil(totalCount / limit);
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${t('list.total_count', { count: totalCount })}\n`;
    message += `${t('list.page_info', { current: page, total: totalPages })}`;
    
    // Create pagination keyboard
    const keyboard = createPaginationKeyboard(user.language, page, totalPages, 'list_page');
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
  } catch (error) {
    logger.error('Error sending reminders list', error);
    throw error;
  }
}

// Handle pagination callbacks
async function handleListPagination(ctx, page) {
  try {
    const user = ctx.user;
    const limit = 5;
    
    await sendRemindersList(ctx, user, parseInt(page), limit);
    
    // Edit the message instead of sending a new one
    await ctx.deleteMessage();
    
    logger.userAction(user._id, 'list_pagination', { page });
    
  } catch (error) {
    logger.error('Error in list pagination', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

module.exports = listHandler;
module.exports.handleListPagination = handleListPagination;
module.exports.sendRemindersList = sendRemindersList;