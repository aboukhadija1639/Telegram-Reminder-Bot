const logger = require('../../../utils/logger');

async function broadcastHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    await ctx.reply('🚧 Broadcast feature coming soon...');
    
    logger.adminAction(user._id, 'broadcast_command');
    
  } catch (error) {
    logger.error('Error in broadcast command', error);
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = broadcastHandler;