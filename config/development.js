module.exports = {
  bot: {
    token: process.env.BOT_TOKEN,
    polling: true, // Use polling for local development
    webhook: false // Disable webhook for local
  },
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    }
  },
  logging: {
    level: 'debug',
    console: true,
    file: false // No file logging for local
  }
};