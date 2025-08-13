const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const { createSnoozeOptionsKeyboard } = require('../../utils/keyboards');

// Snooze states
const SNOOZE_STATES = {
  SELECT: 'select',
  CONFIRM: 'confirm'
};

async function snoozeHandler(ctx) {
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
      await findAndSnoozeReminder(ctx, user, query);
    }
    
    logger.userAction(user._id, 'snooze_command_started');
    
  } catch (error) {
    logger.error('Error in snooze command', error, {
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
      await ctx.reply(t('snooze.no_active_reminders'));
      return;
    }
    
    let message = `${t('snooze.select_reminder')}\n\n`;
    
    reminders.forEach((reminder, index) => {
      const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
      const time = reminder.scheduledTime.toLocaleString(user.language);
      message += `${index + 1}. ${status} **${reminder.title}**\n`;
      message += `   ⏰ ${time}\n`;
      message += `   🆔 ID: \`${reminder._id}\`\n\n`;
    });
    
    message += `${t('snooze.usage_instructions')}`;
    
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

async function findAndSnoozeReminder(ctx, user, query) {
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
      await ctx.reply(t('snooze.reminder_not_found', { query }));
      return;
    }
    
    // Check if reminder is already snoozed
    if (reminder.isSnoozed && reminder.snoozeUntil && new Date() < reminder.snoozeUntil) {
      const remainingTime = Math.ceil((reminder.snoozeUntil - new Date()) / (1000 * 60));
      await ctx.reply(t('snooze.already_snoozed', { 
        title: reminder.title, 
        remainingMinutes: remainingTime 
      }));
      return;
    }
    
    // Show snooze options
    await showSnoozeOptions(ctx, user, reminder);
    
  } catch (error) {
    logger.error('Error finding and snoozing reminder', error, {
      userId: user._id,
      query
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showSnoozeOptions(ctx, user, reminder) {
  try {
    const t = ctx.t;
    
    // Initialize snooze session
    ctx.session.snoozeData = {
      state: SNOOZE_STATES.SELECT,
      reminderId: reminder._id,
      reminderTitle: reminder.title
    };
    
    const message = `${t('snooze.snooze_title')}\n\n` +
      `📝 **${reminder.title}**\n` +
      `⏰ ${t('snooze.current_time')}: ${reminder.scheduledTime.toLocaleString(user.language)}\n\n` +
      `${t('snooze.choose_duration')}`;
    
    const keyboard = createSnoozeOptionsKeyboard(user.language);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing snooze options', error, {
      userId: user._id,
      reminderId: reminder._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle snooze duration selection
async function handleSnoozeDuration(ctx, duration) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const snoozeData = ctx.session.snoozeData;
    
    if (!snoozeData || snoozeData.state !== SNOOZE_STATES.SELECT) {
      return;
    }
    
    // Parse duration
    const durationMap = {
      '5min': 5,
      '15min': 15,
      '30min': 30,
      '1hour': 60,
      '2hours': 120,
      '4hours': 240,
      '1day': 1440
    };
    
    const minutes = durationMap[duration];
    if (!minutes) {
      await ctx.reply(t('snooze.invalid_duration'));
      return;
    }
    
    // Update session
    snoozeData.duration = minutes;
    snoozeData.state = SNOOZE_STATES.CONFIRM;
    
    // Show confirmation
    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    const message = `${t('snooze.confirm_title')}\n\n` +
      `📝 **${snoozeData.reminderTitle}**\n\n` +
      `⏰ ${t('snooze.will_be_snoozed_until')}: ${snoozeTime.toLocaleString(user.language)}\n\n` +
      `${t('snooze.confirm_message')}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: t('common.yes'), callback_data: `snooze_confirm_${duration}` },
          { text: t('common.no'), callback_data: 'snooze_cancel' }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error handling snooze duration', error, {
      userId: user._id,
      duration
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle snooze confirmation
async function handleSnoozeConfirmation(ctx, confirmed, duration) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const snoozeData = ctx.session.snoozeData;
    
    if (!snoozeData) {
      return;
    }
    
    if (confirmed === 'confirm') {
      // Find the reminder
      const reminder = await Reminder.findOne({
        _id: snoozeData.reminderId,
        userId: user._id,
        isActive: true,
        isCompleted: false
      });
      
      if (!reminder) {
        await ctx.reply(t('snooze.reminder_not_found_anymore'));
        delete ctx.session.snoozeData;
        return;
      }
      
      // Apply snooze
      const minutes = parseInt(duration);
      await reminder.snooze(minutes);
      
      const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
      
      await ctx.reply(t('snooze.snoozed_successfully', {
        title: reminder.title,
        until: snoozeTime.toLocaleString(user.language)
      }));
      
      logger.userAction(user._id, 'reminder_snoozed', {
        reminderId: reminder._id,
        snoozeMinutes: minutes
      });
      
    } else {
      await ctx.reply(t('snooze.cancelled'));
    }
    
    // Reset session
    delete ctx.session.snoozeData;
    
  } catch (error) {
    logger.error('Error handling snooze confirmation', error, {
      userId: user._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = snoozeHandler;
module.exports.handleSnoozeDuration = handleSnoozeDuration;
module.exports.handleSnoozeConfirmation = handleSnoozeConfirmation;
module.exports.SNOOZE_STATES = SNOOZE_STATES;