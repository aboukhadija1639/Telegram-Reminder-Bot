const logger = require('../../../utils/logger');

async function usersHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    await ctx.reply('🚧 User management feature coming soon...');
    
    logger.adminAction(user._id, 'users_command');
    
  } catch (error) {
    logger.error('Error in users command', error);
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = usersHandler;