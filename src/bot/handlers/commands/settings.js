const logger = require('../../../utils/logger');
const { createSettingsKeyboard } = require('../../utils/keyboards');

async function settingsHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Create settings message
    let message = `${t('settings.title')}\n\n`;
    message += `${t('settings.current_settings')}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${t('settings.language_setting', { language: getLanguageDisplayName(user.language) })}\n`;
    message += `${t('settings.timezone_setting', { timezone: user.timezone })}\n`;
    
    const notificationStatus = user.settings.notifications 
      ? t('settings.notifications_enabled')
      : t('settings.notifications_disabled');
    message += `${t('settings.notifications_setting', { status: notificationStatus })}\n`;
    message += `${t('settings.default_time_setting', { time: user.settings.defaultReminderTime })}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━`;
    
    // Create settings keyboard
    const keyboard = createSettingsKeyboard(user.language);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    logger.userAction(user._id, 'settings_command');
    
  } catch (error) {
    logger.error('Error in settings command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

function getLanguageDisplayName(language) {
  const languages = {
    ar: 'العربية',
    en: 'English'
  };
  return languages[language] || language;
}

module.exports = settingsHandler;