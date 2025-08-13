const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const User = require('../../../database/models/User');

async function completeHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Check if user provided a reminder ID or title
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      // No arguments - show reminder selection
      await showReminderSelection(ctx, user);
    } else {
      // Try to find reminder by ID or title
      const query = args.join(' ');
      await findAndCompleteReminder(ctx, user, query);
    }
    
    logger.userAction(user._id, 'complete_command_started');
    
  } catch (error) {
    logger.error('Error in complete command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showReminderSelection(ctx, user) {
  try {
    const t = ctx.t;
    
    // Get user's active reminders
    const reminders = await Reminder.find({
      userId: user._id,
      isActive: true,
      isCompleted: false
    })
    .sort({ scheduledTime: 1 })
    .limit(10);
    
    if (reminders.length === 0) {
      await ctx.reply(t('complete.no_active_reminders'));
      return;
    }
    
    let message = `${t('complete.select_reminder')}\n\n`;
    
    reminders.forEach((reminder, index) => {
      const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
      const time = reminder.scheduledTime.toLocaleString(user.language);
      message += `${index + 1}. ${status} **${reminder.title}**\n`;
      message += `   ⏰ ${time}\n`;
      message += `   🆔 ID: \`${reminder._id}\`\n\n`;
    });
    
    message += `${t('complete.usage_instructions')}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    logger.error('Error showing reminder selection', error, {
      userId: user._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function findAndCompleteReminder(ctx, user, query) {
  try {
    const t = ctx.t;
    
    let reminder;
    
    // Try to find by ID first (if it looks like an ObjectId)
    if (/^[0-9a-fA-F]{24}$/.test(query)) {
      reminder = await Reminder.findOne({
        _id: query,
        userId: user._id,
        isActive: true,
        isCompleted: false
      });
    }
    
    // If not found by ID, try by title
    if (!reminder) {
      reminder = await Reminder.findOne({
        title: { $regex: query, $options: 'i' },
        userId: user._id,
        isActive: true,
        isCompleted: false
      });
    }
    
    if (!reminder) {
      await ctx.reply(t('complete.reminder_not_found', { query }));
      return;
    }
    
    // Check if reminder is already completed
    if (reminder.isCompleted) {
      await ctx.reply(t('complete.already_completed', { title: reminder.title }));
      return;
    }
    
    // Show completion confirmation
    await showCompletionConfirmation(ctx, user, reminder);
    
  } catch (error) {
    logger.error('Error finding and completing reminder', error, {
      userId: user._id,
      query
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showCompletionConfirmation(ctx, user, reminder) {
  try {
    const t = ctx.t;
    
    const message = `${t('complete.confirm_title')}\n\n` +
      `📝 **${reminder.title}**\n` +
      `⏰ ${t('complete.scheduled_for')}: ${reminder.scheduledTime.toLocaleString(user.language)}\n\n` +
      `${t('complete.confirm_message')}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: t('common.yes'), callback_data: `complete_confirm_${reminder._id}` },
          { text: t('common.no'), callback_data: 'complete_cancel' }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing completion confirmation', error, {
      userId: user._id,
      reminderId: reminder._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle completion confirmation
async function handleCompleteConfirmation(ctx, confirmed, reminderId) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    if (confirmed === 'confirm') {
      // Find the reminder
      const reminder = await Reminder.findOne({
        _id: reminderId,
        userId: user._id,
        isActive: true,
        isCompleted: false
      });
      
      if (!reminder) {
        await ctx.reply(t('complete.reminder_not_found_anymore'));
        return;
      }
      
      // Mark as completed
      await reminder.complete();
      
      // Update user stats
      await user.incrementCompletedReminders();
      
      // Check if this was an overdue reminder
      const wasOverdue = reminder.scheduledTime < new Date();
      const overdueEmoji = wasOverdue ? '⚠️' : '✅';
      
      await ctx.reply(t('complete.completed_successfully', {
        title: reminder.title,
        overdue: wasOverdue ? t('complete.was_overdue') : '',
        emoji: overdueEmoji
      }));
      
      logger.userAction(user._id, 'reminder_completed', {
        reminderId: reminder._id,
        wasOverdue
      });
      
    } else {
      await ctx.reply(t('complete.cancelled'));
    }
    
  } catch (error) {
    logger.error('Error handling completion confirmation', error, {
      userId: user._id,
      reminderId
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = completeHandler;
module.exports.handleCompleteConfirmation = handleCompleteConfirmation;