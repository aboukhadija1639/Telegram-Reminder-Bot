const logger = require('../../../utils/logger');

async function backupHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    await ctx.reply('🚧 Backup feature coming soon...');
    
    logger.adminAction(user._id, 'backup_command');
    
  } catch (error) {
    logger.error('Error in backup command', error);
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = backupHandler;