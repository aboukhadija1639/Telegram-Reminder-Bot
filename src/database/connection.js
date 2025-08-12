const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
  }

  async connect() {
    try {
      if (this.isConnected) {
        return;
      }

      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_reminder_bot';
      
      // Fixed options - removed deprecated bufferMaxEntries
      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false, // Removed bufferMaxEntries as it's deprecated
      };

      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      logger.info('✅ MongoDB connected successfully', {
        service: 'telegram-reminder-bot',
        version: '1.0.0',
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name
      });
      
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', {
          service: 'telegram-reminder-bot',
          version: '1.0.0',
          error: {
            message: error.message,
            stack: error.stack
          }
        });
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected', {
          service: 'telegram-reminder-bot',
          version: '1.0.0'
        });
        this.isConnected = false;
        this.handleReconnection();
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected', {
          service: 'telegram-reminder-bot',
          version: '1.0.0'
        });
        this.isConnected = true;
      });

    } catch (error) {
      this.connectionAttempts++;
      logger.error(`MongoDB connection failed (attempt ${this.connectionAttempts}):`, {
        service: 'telegram-reminder-bot',
        version: '1.0.0',
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      });
      
      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying connection in 5 seconds...`, {
          service: 'telegram-reminder-bot',
          version: '1.0.0'
        });
        setTimeout(() => this.connect(), 5000);
      } else {
        logger.error('Max connection attempts reached. Exiting...', {
          service: 'telegram-reminder-bot',
          version: '1.0.0'
        });
        process.exit(1);
      }
    }
  }

  async handleReconnection() {
    if (!this.isConnected && this.connectionAttempts < this.maxRetries) {
      setTimeout(() => this.connect(), 5000);
    }
  }

  async disconnect() {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info('MongoDB disconnected gracefully', {
        service: 'telegram-reminder-bot',
        version: '1.0.0'
      });
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', {
        service: 'telegram-reminder-bot',
        version: '1.0.0',
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name
    };
  }
}

module.exports = new DatabaseConnection();