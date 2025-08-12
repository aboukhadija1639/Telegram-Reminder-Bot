const cron = require('node-cron');
const moment = require('moment-timezone');
const Reminder = require('../database/models/Reminder');
const User = require('../database/models/User');
const logger = require('../utils/logger');
const { translate, formatDate, formatTime } = require('../config/i18n');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
    this.mainTask = null;
    this.statsTask = null;
    this.cleanupTask = null;
    this.botInstance = null;
    this.stats = {
      totalExecuted: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      lastExecution: null,
      uptime: Date.now()
    };
  }

  async initialize(botInstance = null) {
    try {
      this.botInstance = botInstance;
      
      logger.info('🔄 Initializing Scheduler Service...');
      
      // Start main reminder checker (every minute)
      this.mainTask = cron.schedule('* * * * *', async () => {
        await this.checkAndExecuteReminders();
      }, {
        scheduled: false,
        timezone: 'UTC'
      });
      
      // Start statistics updater (every 5 minutes)
      this.statsTask = cron.schedule('*/5 * * * *', async () => {
        await this.updateStats();
      }, {
        scheduled: false,
        timezone: 'UTC'
      });
      
      // Start cleanup task (daily at 2 AM UTC)
      this.cleanupTask = cron.schedule('0 2 * * *', async () => {
        await this.cleanupOldReminders();
      }, {
        scheduled: false,
        timezone: 'UTC'
      });
      
      // Start all tasks
      this.start();
      
      logger.info('✅ Scheduler Service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Scheduler Service', error);
      throw error;
    }
  }

  start() {
    if (this.isRunning) {
      logger.warn('Scheduler Service is already running');
      return;
    }
    
    this.mainTask?.start();
    this.statsTask?.start();
    this.cleanupTask?.start();
    this.isRunning = true;
    
    logger.cronJob('scheduler_service', 'started');
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler Service is not running');
      return;
    }
    
    this.mainTask?.stop();
    this.statsTask?.stop();
    this.cleanupTask?.stop();
    this.isRunning = false;
    
    logger.cronJob('scheduler_service', 'stopped');
  }

  async checkAndExecuteReminders() {
    try {
      const startTime = Date.now();
      
      // Find reminders ready to execute
      const readyReminders = await Reminder.findReadyToExecute();
      
      if (readyReminders.length === 0) {
        return;
      }
      
      logger.cronJob('reminder_check', 'found_reminders', {
        count: readyReminders.length
      });
      
      // Execute reminders concurrently (but limit concurrency)
      const concurrencyLimit = 10;
      const batches = this.chunkArray(readyReminders, concurrencyLimit);
      
      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(reminder => this.executeReminder(reminder))
        );
      }
      
      const duration = Date.now() - startTime;
      logger.performance('reminder_execution_batch', duration, {
        reminderCount: readyReminders.length
      });
      
    } catch (error) {
      logger.error('Error in checkAndExecuteReminders', error);
    }
  }

  async executeReminder(reminder) {
    try {
      const startTime = Date.now();
      
      if (!reminder.userId) {
        logger.error('Reminder has no user ID', { reminderId: reminder._id });
        return;
      }
      
      // Populate user data if not already populated
      if (!reminder.userId.language) {
        await reminder.populate('userId');
      }
      
      const user = reminder.userId;
      const t = (key, options) => translate(user.language, key, options);
      
      // Check if user is still active and not banned
      if (!user.isActive || user.isBanned) {
        logger.security('Skipping reminder for inactive/banned user', {
          userId: user._id,
          reminderId: reminder._id
        });
        return;
      }
      
      // Format reminder message
      const message = this.formatReminderNotification(reminder, user);
      
      // Send reminder message
      await this.sendReminderMessage(user.telegramId, message, reminder);
      
      // Update reminder status
      await this.handleReminderCompletion(reminder);
      
      // Update user stats
      await user.incrementCompletedReminders();
      
      this.stats.totalExecuted++;
      this.stats.successfulExecutions++;
      this.stats.lastExecution = new Date();
      
      const duration = Date.now() - startTime;
      logger.reminderAction(reminder._id, 'executed', user._id, {
        duration: `${duration}ms`,
        title: reminder.title,
        priority: reminder.priority
      });
      
    } catch (error) {
      logger.error('Error executing reminder', error, {
        reminderId: reminder._id,
        userId: reminder.userId?._id
      });
      
      // Log execution failure
      await reminder.addExecutionHistory('failed', error.message);
      
      this.stats.totalExecuted++;
      this.stats.failedExecutions++;
    }
  }

  formatReminderNotification(reminder, user) {
    const t = (key, options) => translate(user.language, key, options);
    
    const priorityEmoji = {
      low: '🟢',
      normal: '🟡',
      high: '🟠',
      urgent: '🔴'
    };
    
    const emoji = priorityEmoji[reminder.priority] || '🟡';
    const currentTime = moment().tz(user.timezone);
    
    let message = `${emoji} **${t('reminder.notification_title')}**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📋 **${reminder.title}**\n`;
    
    if (reminder.message) {
      message += `\n💬 ${reminder.message}\n`;
    }
    
    message += `\n📅 ${formatDate(reminder.scheduledTime, user.language)}`;
    message += `\n⏰ ${formatTime(reminder.scheduledTime, user.language)}`;
    
    if (reminder.priority !== 'normal') {
      message += `\n${emoji} ${t(`reminder.priority_${reminder.priority}`)}`;
    }
    
    if (reminder.category) {
      message += `\n📂 ${reminder.category}`;
    }
    
    if (reminder.tags && reminder.tags.length > 0) {
      message += `\n🏷️ ${reminder.tags.join(', ')}`;
    }
    
    message += `\n\n${t('reminder.notification_footer', { 
      time: formatTime(currentTime, user.language) 
    })}`;
    
    return message;
  }

  async sendReminderMessage(telegramId, message, reminder) {
    try {
      if (!this.botInstance || !this.botInstance.telegram) {
        // If no bot instance, we can't send messages
        logger.warn('No bot instance available for sending messages');
        return;
      }
      
      // Send main reminder message
      await this.botInstance.telegram.sendMessage(
        telegramId,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ تم', callback_data: `complete_${reminder._id}` },
                { text: '⏰ تأجيل', callback_data: `snooze_${reminder._id}` }
              ]
            ]
          }
        }
      );
      
      // Send attachments if any
      if (reminder.attachments && reminder.attachments.length > 0) {
        for (const attachment of reminder.attachments) {
          await this.sendAttachment(telegramId, attachment);
        }
      }
      
      // Log successful execution
      await reminder.addExecutionHistory('sent', null);
      
    } catch (error) {
      logger.telegramError(error, {
        telegramId,
        reminderId: reminder._id
      });
      
      // Log failed execution
      await reminder.addExecutionHistory('failed', error.message);
      throw error;
    }
  }

  async sendAttachment(telegramId, attachment) {
    try {
      if (!this.botInstance) return;
      
      const { type, fileId, fileName } = attachment;
      
      switch (type) {
        case 'photo':
          await this.botInstance.telegram.sendPhoto(telegramId, fileId);
          break;
        case 'document':
          await this.botInstance.telegram.sendDocument(telegramId, fileId);
          break;
        case 'audio':
          await this.botInstance.telegram.sendAudio(telegramId, fileId);
          break;
        case 'video':
          await this.botInstance.telegram.sendVideo(telegramId, fileId);
          break;
        case 'voice':
          await this.botInstance.telegram.sendVoice(telegramId, fileId);
          break;
        case 'sticker':
          await this.botInstance.telegram.sendSticker(telegramId, fileId);
          break;
        default:
          logger.warn('Unknown attachment type', { type, reminderId: attachment.reminderId });
      }
    } catch (error) {
      logger.error('Error sending attachment', error, {
        telegramId,
        attachment
      });
    }
  }

  async handleReminderCompletion(reminder) {
    try {
      if (reminder.isRecurring) {
        // Create next recurrence
        const nextReminder = await reminder.createNextRecurrence();
        
        if (nextReminder) {
          logger.reminderAction(reminder._id, 'recurrence_created', reminder.userId, {
            nextReminderId: nextReminder._id,
            nextScheduledTime: nextReminder.scheduledTime
          });
        } else {
          logger.reminderAction(reminder._id, 'recurrence_completed', reminder.userId, {
            reason: 'max_recurrences_reached'
          });
        }
      }
      
      // Mark current reminder as completed
      await reminder.complete();
      
    } catch (error) {
      logger.error('Error handling reminder completion', error, {
        reminderId: reminder._id
      });
    }
  }

  async updateStats() {
    try {
      const totalReminders = await Reminder.countDocuments();
      const activeReminders = await Reminder.countDocuments({ isActive: true });
      const completedReminders = await Reminder.countDocuments({ isCompleted: true });
      const overdueReminders = await Reminder.countDocuments({
        isActive: true,
        isCompleted: false,
        scheduledTime: { $lt: new Date() }
      });
      
      logger.performance('scheduler_stats_update', 0, {
        totalReminders,
        activeReminders,
        completedReminders,
        overdueReminders,
        executionStats: this.stats
      });
      
    } catch (error) {
      logger.error('Error updating scheduler stats', error);
    }
  }

  async cleanupOldReminders() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago
      
      // Delete old completed reminders
      const result = await Reminder.deleteMany({
        isCompleted: true,
        completedAt: { $lt: cutoffDate }
      });
      
      logger.cronJob('cleanup_old_reminders', 'completed', {
        deletedCount: result.deletedCount,
        cutoffDate
      });
      
    } catch (error) {
      logger.error('Error cleaning up old reminders', error);
    }
  }

  // Schedule a specific reminder
  async scheduleReminder(reminder) {
    try {
      const reminderTime = moment(reminder.scheduledTime);
      const now = moment();
      
      if (reminderTime.isBefore(now)) {
        // If the reminder time has passed, execute immediately
        await this.executeReminder(reminder);
        return;
      }
      
      // Calculate delay until reminder time
      const delay = reminderTime.diff(now);
      
      // Create a timeout for this specific reminder
      const timeoutId = setTimeout(async () => {
        await this.executeReminder(reminder);
        this.jobs.delete(reminder._id.toString());
      }, delay);
      
      // Store the timeout so we can cancel it if needed
      this.jobs.set(reminder._id.toString(), timeoutId);
      
      logger.reminderAction(reminder._id, 'scheduled', reminder.userId, {
        scheduledTime: reminder.scheduledTime,
        delay: `${delay}ms`
      });
      
    } catch (error) {
      logger.error('Error scheduling reminder', error, {
        reminderId: reminder._id
      });
    }
  }

  // Cancel a scheduled reminder
  cancelReminder(reminderId) {
    const timeoutId = this.jobs.get(reminderId.toString());
    
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.jobs.delete(reminderId.toString());
      
      logger.reminderAction(reminderId, 'schedule_cancelled');
      return true;
    }
    
    return false;
  }

  // Utility function to chunk array into smaller arrays
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      uptime: Date.now() - this.stats.uptime
    };
  }

  setBotInstance(botInstance) {
    this.botInstance = botInstance;
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;