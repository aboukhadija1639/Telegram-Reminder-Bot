const logger = require('../../../utils/logger');
const { createLanguageKeyboard } = require('../../utils/keyboards');

async function languageHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    const message = t('registration.choose_language');
    const keyboard = createLanguageKeyboard(user.language);
    
    await ctx.reply(message, keyboard);
    
    logger.userAction(user._id, 'language_command');
    
  } catch (error) {
    logger.error('Error in language command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = languageHandler;