const logger = require('../../../utils/logger');
const { createTimezoneKeyboard } = require('../../utils/keyboards');

async function timezoneHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    let message = `${t('timezone.select_timezone')}\n\n`;
    message += `${t('timezone.current_timezone', { timezone: user.timezone })}\n\n`;
    message += `${t('timezone.common_timezones')}`;
    
    const keyboard = createTimezoneKeyboard(user.language, user.timezone);
    
    await ctx.reply(message, keyboard);
    
    logger.userAction(user._id, 'timezone_command');
    
  } catch (error) {
    logger.error('Error in timezone command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = timezoneHandler;