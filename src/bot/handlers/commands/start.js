const logger = require('../../../utils/logger');
const { createLanguageKeyboard } = require('../../utils/keyboards');

async function startHandler(ctx) {
  try {
    const user = ctx.user;
    const isNewUser = !user.lastActive || user.stats.joinDate > new Date(Date.now() - 60000); // New if joined in last minute
    
    if (isNewUser) {
      // New user registration flow
      await handleNewUserRegistration(ctx, user);
    } else {
      // Existing user welcome back
      await handleExistingUserWelcome(ctx, user);
    }
    
    logger.userAction(user._id, 'start_command', {
      isNewUser,
      language: user.language
    });
    
  } catch (error) {
    logger.error('Error in start command', error, {
      userId: ctx.user?._id,
      telegramId: ctx.from?.id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function handleNewUserRegistration(ctx, user) {
  const t = ctx.t;
  
  // Send welcome message for new users
  const welcomeMessage = t('registration.welcome_new_user', { 
    name: user.getFormattedName() 
  });
  
  await ctx.reply(welcomeMessage);
  
  // Check if language detection was successful
  if (user.language === 'ar' || user.language === 'en') {
    // Language was detected, proceed to timezone setup
    await sendTimezoneSetup(ctx, user);
  } else {
    // Ask for language preference
    const languageMessage = t('registration.choose_language');
    const keyboard = createLanguageKeyboard(user.language);
    
    await ctx.reply(languageMessage, keyboard);
  }
}

async function handleExistingUserWelcome(ctx, user) {
  const t = ctx.t;
  
  // Welcome back message
  const welcomeMessage = t('welcome');
  await ctx.reply(welcomeMessage);
  
  // Show quick stats
  const stats = await getUserQuickStats(user);
  if (stats.totalReminders > 0) {
    const statsMessage = getStatsMessage(t, stats);
    await ctx.reply(statsMessage);
  }
}

async function sendTimezoneSetup(ctx, user) {
  const t = ctx.t;
  
  // Auto-detect timezone based on user's locale or use default
  let defaultTimezone = 'Asia/Damascus';
  
  // Try to detect timezone from user's language
  const timezoneMap = {
    'ar': 'Asia/Damascus',
    'en': 'America/New_York'
  };
  
  defaultTimezone = timezoneMap[user.language] || 'Asia/Damascus';
  
  // Update user timezone if not set
  if (!user.timezone || user.timezone === 'Asia/Damascus') {
    user.timezone = defaultTimezone;
    await user.save();
  }
  
  const timezoneMessage = t('registration.timezone_set', { 
    timezone: user.timezone 
  });
  
  await ctx.reply(timezoneMessage);
  
  // Complete setup
  await completeSetup(ctx, user);
}

async function completeSetup(ctx, user) {
  const t = ctx.t;
  
  const completionMessage = t('registration.setup_complete');
  await ctx.reply(completionMessage);
  
  // Send help information
  setTimeout(async () => {
    try {
      const helpCommand = require('./help');
      await helpCommand(ctx);
    } catch (error) {
      logger.error('Error sending help after setup', error);
    }
  }, 2000);
}

async function getUserQuickStats(user) {
  try {
    const Reminder = require('../../../database/models/Reminder');
    
    const [
      totalReminders,
      activeReminders,
      completedToday
    ] = await Promise.all([
      Reminder.countDocuments({ userId: user._id }),
      Reminder.countDocuments({ 
        userId: user._id, 
        isActive: true, 
        isCompleted: false 
      }),
      Reminder.countDocuments({
        userId: user._id,
        isCompleted: true,
        completedAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      })
    ]);
    
    return {
      totalReminders,
      activeReminders,
      completedToday
    };
    
  } catch (error) {
    logger.error('Error getting user quick stats', error);
    return {
      totalReminders: 0,
      activeReminders: 0,
      completedToday: 0
    };
  }
}

function getStatsMessage(t, stats) {
  const { formatNumber } = require('../../../config/i18n');
  
  let message = `📊 **${t('settings.account_info')}**\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📋 ${t('admin.total_reminders', { count: formatNumber(stats.totalReminders) })}\n`;
  message += `⏳ ${t('admin.pending_reminders', { count: formatNumber(stats.activeReminders) })}\n`;
  message += `✅ ${t('admin.completed_reminders')}: ${formatNumber(stats.completedToday)} ${t('common.today')}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━`;
  
  return message;
}

module.exports = startHandler;