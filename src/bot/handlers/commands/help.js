const logger = require('../../../utils/logger');
const { createHelpKeyboard } = require('../../utils/keyboards');

async function helpHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const isAdmin = user.isAdmin;
    
    // Create help message
    let helpMessage = `${t('help.title')}\n\n`;
    helpMessage += `${t('help.description')}\n\n`;
    
    // User commands section
    helpMessage += `**${t('help.user_commands')}**\n`;
    helpMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
    helpMessage += `/start - ${t('help.start')}\n`;
    helpMessage += `/help - ${t('help.help')}\n`;
    helpMessage += `/remind - ${t('help.remind')}\n`;
    helpMessage += `/list - ${t('help.list')}\n`;
    helpMessage += `/settings - ${t('help.settings')}\n`;
    helpMessage += `/language - ${t('help.language')}\n`;
    helpMessage += `/timezone - ${t('help.timezone')}\n`;
    
    // Admin commands section (if user is admin)
    if (isAdmin) {
      helpMessage += `\n**${t('help.admin_commands')}**\n`;
      helpMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
      helpMessage += `/stats - ${t('help.stats')}\n`;
      helpMessage += `/broadcast - ${t('help.broadcast')}\n`;
      helpMessage += `/users - ${t('help.users')}\n`;
      helpMessage += `/logs - ${t('help.logs')}\n`;
      helpMessage += `/backup - ${t('help.backup')}\n`;
    }
    
    // Add tips for new users
    if (isNewUser(user)) {
      helpMessage += getNewUserTips(t);
    }
    
    // Create interactive keyboard
    const keyboard = createHelpKeyboard(user.language, isAdmin);
    
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    logger.userAction(user._id, 'help_command', {
      isAdmin,
      isNewUser: isNewUser(user)
    });
    
  } catch (error) {
    logger.error('Error in help command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

function isNewUser(user) {
  // Consider user new if they joined in the last 24 hours or have no reminders
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return user.stats.joinDate > dayAgo || user.stats.totalReminders === 0;
}

function getNewUserTips(t) {
  let tips = `\n\n💡 **${t('common.info')}**\n`;
  tips += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (t('help.user_commands').includes('العربية') || t === undefined) {
    // Arabic tips
    tips += `🎯 ابدأ بإنشاء تذكيرك الأول باستخدام /remind\n`;
    tips += `⚙️ تخصيص إعداداتك من /settings\n`;
    tips += `🌐 يمكنك تغيير اللغة في أي وقت\n`;
    tips += `📱 استخدم الأزرار التفاعلية للتنقل السريع\n`;
  } else {
    // English tips  
    tips += `🎯 Start by creating your first reminder with /remind\n`;
    tips += `⚙️ Customize your settings with /settings\n`;
    tips += `🌐 You can change language anytime\n`;
    tips += `📱 Use interactive buttons for quick navigation\n`;
  }
  
  return tips;
}

// Handle help callback queries for detailed help sections
async function handleHelpCallback(ctx, section) {
  try {
    const t = ctx.t;
    let message = '';
    
    switch (section) {
      case 'remind':
        message = getRemindHelp(t);
        break;
      case 'list':
        message = getListHelp(t);
        break;
      case 'settings':
        message = getSettingsHelp(t);
        break;
      case 'language':
        message = getLanguageHelp(t);
        break;
      case 'admin':
        message = getAdminHelp(t);
        break;
      case 'users':
        message = getUsersHelp(t);
        break;
      default:
        message = t('errors.not_found');
    }
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: t('common.back'), callback_data: 'help_main' }]
        ]
      }
    });
    
  } catch (error) {
    logger.error('Error in help callback', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

function getRemindHelp(t) {
  let help = `📝 **${t('help.remind')}**\n\n`;
  help += `${t('reminder.create_title')}\n\n`;
  help += `**${t('common.info')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• ${t('reminder.enter_title')}\n`;
  help += `• ${t('reminder.enter_message')}\n`;
  help += `• ${t('reminder.enter_date')}\n`;
  help += `• ${t('reminder.enter_time')}\n`;
  help += `• ${t('reminder.choose_recurrence')}\n`;
  help += `• ${t('reminder.choose_priority')}\n\n`;
  help += `**${t('common.example')}:**\n`;
  help += `\`/remind\`\n`;
  help += `📋 ${t('common.title')}: "اجتماع المشروع"\n`;
  help += `💬 ${t('common.message')}: "مراجعة التقدم"\n`;
  help += `📅 ${t('common.date')}: 2024-12-25\n`;
  help += `⏰ ${t('common.time')}: 14:30\n`;
  
  return help;
}

function getListHelp(t) {
  let help = `📋 **${t('help.list')}**\n\n`;
  help += `${t('list.title')}\n\n`;
  help += `**${t('common.features')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• ${t('list.view_details')}\n`;
  help += `• ${t('list.edit')}\n`;
  help += `• ${t('list.complete')}\n`;
  help += `• ${t('list.snooze')}\n`;
  help += `• ${t('list.delete')}\n\n`;
  help += `**${t('common.navigation')}:**\n`;
  help += `• ${t('list.next_page')}\n`;
  help += `• ${t('list.prev_page')}\n`;
  
  return help;
}

function getSettingsHelp(t) {
  let help = `⚙️ **${t('help.settings')}**\n\n`;
  help += `${t('settings.title')}\n\n`;
  help += `**${t('common.options')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• ${t('settings.change_language')}\n`;
  help += `• ${t('settings.change_timezone')}\n`;
  help += `• ${t('settings.toggle_notifications')}\n`;
  help += `• ${t('settings.set_default_time')}\n`;
  help += `• ${t('settings.account_info')}\n`;
  help += `• ${t('settings.export_data')}\n`;
  
  return help;
}

function getLanguageHelp(t) {
  let help = `🌐 **${t('help.language')}**\n\n`;
  help += `${t('registration.choose_language')}\n\n`;
  help += `**${t('common.available')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• 🇸🇦 العربية (Arabic)\n`;
  help += `• 🇺🇸 English\n\n`;
  help += `**${t('common.note')}:**\n`;
  help += `يمكنك تغيير اللغة في أي وقت من الإعدادات\n`;
  help += `You can change language anytime from settings\n`;
  
  return help;
}

function getAdminHelp(t) {
  let help = `👑 **${t('help.stats')}**\n\n`;
  help += `${t('admin.stats_title')}\n\n`;
  help += `**${t('common.features')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• ${t('admin.total_users')}\n`;
  help += `• ${t('admin.total_reminders')}\n`;
  help += `• ${t('admin.system_status')}\n`;
  help += `• ${t('admin.database_status')}\n`;
  help += `• ${t('admin.memory_usage')}\n`;
  
  return help;
}

function getUsersHelp(t) {
  let help = `👥 **${t('help.users')}**\n\n`;
  help += `${t('admin.users_title')}\n\n`;
  help += `**${t('common.actions')}:**\n`;
  help += `━━━━━━━━━━━━━━━━━━━━\n`;
  help += `• ${t('admin.ban_user')}\n`;
  help += `• ${t('admin.unban_user')}\n`;
  help += `• ${t('admin.make_admin')}\n`;
  help += `• ${t('admin.remove_admin')}\n`;
  help += `• ${t('admin.user_search')}\n`;
  
  return help;
}

module.exports = helpHandler;
module.exports.handleHelpCallback = handleHelpCallback;