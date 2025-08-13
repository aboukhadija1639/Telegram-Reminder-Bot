require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const express = require('express');
const dbConnection = require('./database/connection');
const logger = require('./utils/logger');

// Import middlewares
const {
  authMiddleware,
  adminMiddleware,
  createRateLimitMiddleware,
  maintenanceMiddleware,
  languageMiddleware,
  errorMiddleware,
  loggingMiddleware
} = require('./bot/middlewares/auth');

// Import handlers (will be created later)
const startHandler = require('./bot/handlers/commands/start');
const helpHandler = require('./bot/handlers/commands/help');
const remindHandler = require('./bot/handlers/commands/remind');
const listHandler = require('./bot/handlers/commands/list');
const editHandler = require('./bot/handlers/commands/edit');
const deleteHandler = require('./bot/handlers/commands/delete');
const settingsHandler = require('./bot/handlers/commands/settings');
const languageHandler = require('./bot/handlers/commands/language');
const timezoneHandler = require('./bot/handlers/commands/timezone');

// Import new feature handlers
const searchHandler = require('./bot/handlers/commands/search');
const categoriesHandler = require('./bot/handlers/commands/categories');
const tagsHandler = require('./bot/handlers/commands/tags');
const snoozeHandler = require('./bot/handlers/commands/snooze');
const completeHandler = require('./bot/handlers/commands/complete');

// Import admin handlers
const statsHandler = require('./bot/handlers/commands/stats');
const broadcastHandler = require('./bot/handlers/commands/broadcast');
const usersHandler = require('./bot/handlers/commands/users');
const logsHandler = require('./bot/handlers/commands/logs');
const backupHandler = require('./bot/handlers/commands/backup');

// Import callback handlers
const callbackHandler = require('./bot/handlers/callbacks');

// Import services
const schedulerService = require('./services/schedulerService');

class TelegramReminderBot {
  constructor() {
    this.bot = null;
    this.server = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      logger.info('🚀 Starting Telegram Reminder Bot...');
      
      // Validate environment variables
      this.validateEnvironment();
      
      // Connect to database
      await dbConnection.connect();
      
      // Initialize bot
      this.bot = new Telegraf(process.env.BOT_TOKEN);
      
      // Setup middlewares
      this.setupMiddlewares();
      
      // Setup command handlers
      this.setupCommandHandlers();
      
      // Setup callback handlers
      this.setupCallbackHandlers();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Initialize scheduler
      await schedulerService.initialize(this.bot);
      
      logger.info('✅ Bot initialization completed');
      
    } catch (error) {
      logger.error('❌ Bot initialization failed', error);
      process.exit(1);
    }
  }

  validateEnvironment() {
    const requiredVars = ['BOT_TOKEN', 'MONGODB_URI'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    logger.info('✅ Environment validation passed');
  }

  setupMiddlewares() {
    logger.info('Setting up middlewares...');
    
    // Session middleware
    this.bot.use(session({
      defaultSession: () => ({ 
        scene: null,
        reminderData: {},
        userData: {},
        language: 'ar'
      })
    }));
    
    // Logging middleware (first)
    this.bot.use(loggingMiddleware());
    
    // Error handling middleware
    this.bot.use(errorMiddleware());
    
    // Rate limiting
    this.bot.use(createRateLimitMiddleware({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 30
    }));
    
    // Maintenance mode check
    this.bot.use(maintenanceMiddleware);
    
    // Language detection (for new users)
    this.bot.use(languageMiddleware);
    
    // Authentication (creates/updates user)
    this.bot.use(authMiddleware);
    
    logger.info('✅ Middlewares setup completed');
  }

  setupCommandHandlers() {
    logger.info('Setting up command handlers...');
    
    // User commands
    this.bot.command('start', startHandler);
    this.bot.command('help', helpHandler);
    this.bot.command('remind', remindHandler);
    this.bot.command('list', listHandler);
    this.bot.command('edit', editHandler);
    this.bot.command('delete', deleteHandler);
    this.bot.command('settings', settingsHandler);
    this.bot.command('language', languageHandler);
    this.bot.command('timezone', timezoneHandler);
    
    // New feature commands
    this.bot.command('search', searchHandler);
    this.bot.command('categories', categoriesHandler);
    this.bot.command('tags', tagsHandler);
    this.bot.command('snooze', snoozeHandler);
    this.bot.command('complete', completeHandler);
    
    // Admin commands (with admin middleware)
    this.bot.command('stats', adminMiddleware, statsHandler);
    this.bot.command('broadcast', adminMiddleware, broadcastHandler);
    this.bot.command('users', adminMiddleware, usersHandler);
    this.bot.command('logs', adminMiddleware, logsHandler);
    this.bot.command('backup', adminMiddleware, backupHandler);
    
    logger.info('✅ Command handlers setup completed');
  }

  setupCallbackHandlers() {
    logger.info('Setting up callback handlers...');
    
    // Handle all callback queries
    this.bot.on('callback_query', callbackHandler);
    
    // Handle text messages for reminder wizard and edit wizard
    this.bot.on('text', async (ctx) => {
      try {
        // Try reminder wizard first
        const { handleReminderInput } = require('./bot/handlers/commands/remind');
        const reminderHandled = await handleReminderInput(ctx);
        
        if (!reminderHandled) {
          // Try edit wizard
          const { handleEditInput } = require('./bot/handlers/commands/edit');
          const editHandled = await handleEditInput(ctx);
          
          if (!editHandled) {
            // Try search input
            const { handleSearchInput } = require('./bot/handlers/commands/search');
            const searchHandled = await handleSearchInput(ctx);
            
            if (!searchHandled) {
              // Try categories input
              const { handleCategoriesInput } = require('./bot/handlers/commands/categories');
              const categoriesHandled = await handleCategoriesInput(ctx);
              
              if (!categoriesHandled) {
                // Try tags input
                const { handleTagsInput } = require('./bot/handlers/commands/tags');
                const tagsHandled = await handleTagsInput(ctx);
                
                if (!tagsHandled) {
                  // Try broadcast input (admin only)
                  if (ctx.user?.isAdmin) {
                    const { handleBroadcastInput } = require('./bot/handlers/commands/broadcast');
                    const broadcastHandled = await handleBroadcastInput(ctx);
                    
                    // If no handler processed the input but user is in a session, show error
                    if (!broadcastHandled && (ctx.session.reminderData || ctx.session.editData || ctx.session.broadcastData || ctx.session.searchData || ctx.session.categoriesData || ctx.session.tagsData)) {
                      await ctx.reply(ctx.t('reminder.unexpected_input'));
                    }
                  } else if (ctx.session.reminderData || ctx.session.editData || ctx.session.searchData || ctx.session.categoriesData || ctx.session.tagsData) {
                    // User is in a session but not admin
                    await ctx.reply(ctx.t('reminder.unexpected_input'));
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error('Error handling text message', error, {
          userId: ctx.user?._id,
          text: ctx.message?.text
        });
      }
    });
    
    logger.info('✅ Callback handlers setup completed');
  }

  setupErrorHandling() {
    // Global error handlers
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      this.gracefulShutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at Promise', { reason, promise });
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, starting graceful shutdown...');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, starting graceful shutdown...');
      this.gracefulShutdown();
    });

    logger.info('✅ Error handling setup completed');
  }

  async startBot() {
    try {
      const PORT = process.env.PORT || 3000;
      const NODE_ENV = process.env.NODE_ENV || 'development';
      
      if (NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
        // Production mode with webhook
        await this.setupWebhook(PORT);
      } else {
        // Development mode with polling
        await this.startPolling();
      }
      
      logger.info(`🎉 Bot started successfully in ${NODE_ENV} mode`);
      
    } catch (error) {
      logger.error('❌ Failed to start bot', error);
      process.exit(1);
    }
  }

  async setupWebhook(port) {
    logger.info('Setting up webhook...');
    
    // Create Express app for webhook
    const app = express();
    app.use(express.json());
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: dbConnection.getStatus()
      });
    });
    
    // Webhook endpoint
    app.post('/webhook', (req, res) => {
      this.bot.handleUpdate(req.body);
      res.status(200).send('OK');
    });
    
    // Start server
    this.server = app.listen(port, () => {
      logger.info(`🌐 Webhook server listening on port ${port}`);
    });
    
    // Set webhook
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
    await this.bot.telegram.setWebhook(webhookUrl);
    
    logger.info(`✅ Webhook set to: ${webhookUrl}`);
  }

  async startPolling() {
    logger.info('Starting polling...');
    
    // Remove webhook if exists
    await this.bot.telegram.deleteWebhook();
    
    // Start polling
    await this.bot.launch({
      polling: {
        timeout: 10,
        limit: 100,
        allowed_updates: ['message', 'callback_query', 'inline_query']
      }
    });
    
    logger.info('✅ Polling started');
  }

  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logger.info('🔄 Starting graceful shutdown...');
    
    try {
      // Stop accepting new requests
      if (this.server) {
        this.server.close();
      }
      
      // Stop the bot
      if (this.bot) {
        this.bot.stop('SIGTERM');
      }
      
      // Stop scheduler
      await schedulerService.stop();
      
      // Close database connection
      await dbConnection.disconnect();
      
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', error);
      process.exit(1);
    }
  }

  async getStats() {
    try {
      const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: dbConnection.getStatus(),
        scheduler: schedulerService.getStats(),
        environment: process.env.NODE_ENV
      };
      
      return stats;
    } catch (error) {
      logger.error('Error getting bot stats', error);
      return null;
    }
  }
}

// Initialize and start the bot
async function main() {
  const bot = new TelegramReminderBot();
  
  try {
    await bot.initialize();
    await bot.startBot();
    
    // Log startup success
    logger.botEvent('bot_started', {
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version
    });
    
  } catch (error) {
    logger.error('❌ Failed to start bot', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main();
}

module.exports = TelegramReminderBot;
