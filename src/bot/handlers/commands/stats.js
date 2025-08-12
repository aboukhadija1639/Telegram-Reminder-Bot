const logger = require('../../../utils/logger');
const User = require('../../../database/models/User');
const Reminder = require('../../../database/models/Reminder');
const dbConnection = require('../../../database/connection');
const schedulerService = require('../../../services/schedulerService');
const { formatNumber } = require('../../../config/i18n');

async function statsHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Get system stats
    const stats = await getSystemStats();
    
    // Format stats message
    let message = `${t('admin.stats_title')}\n\n`;
    message += `**${t('admin.system_status')}**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${t('admin.database_status', { status: stats.database.isConnected ? '✅ Connected' : '❌ Disconnected' })}\n`;
    message += `${t('admin.memory_usage', { usage: formatMemoryUsage(stats.memory.used) })}\n`;
    message += `${t('admin.uptime', { time: formatUptime(stats.uptime) })}\n\n`;
    
    message += `**📊 User Statistics**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${t('admin.total_users', { count: formatNumber(stats.users.total, user.language) })}\n`;
    message += `${t('admin.active_users', { count: formatNumber(stats.users.active, user.language) })}\n`;
    message += `${t('admin.language_distribution')}\n`;
    message += `${t('admin.arabic_users', { count: formatNumber(stats.users.arabic, user.language) })}\n`;
    message += `${t('admin.english_users', { count: formatNumber(stats.users.english, user.language) })}\n\n`;
    
    message += `**📋 Reminder Statistics**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${t('admin.total_reminders', { count: formatNumber(stats.reminders.total, user.language) })}\n`;
    message += `${t('admin.pending_reminders', { count: formatNumber(stats.reminders.pending, user.language) })}\n`;
    message += `${t('admin.completed_reminders', { count: formatNumber(stats.reminders.completed, user.language) })}\n\n`;
    
    message += `**🔄 Scheduler Statistics**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Status: ${stats.scheduler.isRunning ? '✅ Running' : '❌ Stopped'}\n`;
    message += `Executed: ${formatNumber(stats.scheduler.totalExecuted, user.language)}\n`;
    message += `Success Rate: ${stats.scheduler.successRate}%\n`;
    message += `Active Jobs: ${formatNumber(stats.scheduler.activeJobs, user.language)}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown'
    });
    
    logger.adminAction(user._id, 'stats_viewed', null, stats);
    
  } catch (error) {
    logger.error('Error in stats command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function getSystemStats() {
  try {
    // Get user statistics
    const [totalUsers, activeUsers, arabicUsers, englishUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, isBanned: false }),
      User.countDocuments({ language: 'ar', isActive: true }),
      User.countDocuments({ language: 'en', isActive: true })
    ]);
    
    // Get reminder statistics
    const [totalReminders, pendingReminders, completedReminders] = await Promise.all([
      Reminder.countDocuments(),
      Reminder.countDocuments({ isActive: true, isCompleted: false }),
      Reminder.countDocuments({ isCompleted: true })
    ]);
    
    // Get system info
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    const dbStatus = dbConnection.getStatus();
    const schedulerStats = schedulerService.getStats();
    
    // Calculate success rate
    const successRate = schedulerStats.totalExecuted > 0 
      ? Math.round((schedulerStats.successfulExecutions / schedulerStats.totalExecuted) * 100)
      : 100;
    
    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        arabic: arabicUsers,
        english: englishUsers
      },
      reminders: {
        total: totalReminders,
        pending: pendingReminders,
        completed: completedReminders
      },
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal
      },
      uptime,
      database: dbStatus,
      scheduler: {
        ...schedulerStats,
        successRate
      }
    };
    
  } catch (error) {
    logger.error('Error getting system stats', error);
    throw error;
  }
}

function formatMemoryUsage(bytes) {
  const mb = Math.round(bytes / 1024 / 1024);
  return `${mb} MB`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

module.exports = statsHandler;