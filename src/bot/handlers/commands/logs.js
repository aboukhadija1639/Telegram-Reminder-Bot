const logger = require('../../../utils/logger');

async function logsHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    await ctx.reply('🚧 Logs viewer coming soon...');
    
    logger.adminAction(user._id, 'logs_command');
    
  } catch (error) {
    logger.error('Error in logs command', error);
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = logsHandler;