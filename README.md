# 🤖 Telegram Reminder Bot

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-4.4+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**Advanced Telegram Reminder Bot with Multi-language Support (Arabic/English)**

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Deployment](#deployment) • [Contributing](#contributing)

</div>

## 🌟 Features

### 🎯 Core Functionality
- **Multi-language Support**: Arabic (RTL) and English with proper formatting
- **Smart Reminders**: Create one-time or recurring reminders with various patterns
- **Timezone Support**: Automatic timezone detection and manual configuration
- **Priority Levels**: Low, Normal, High, and Urgent priority levels
- **Rich Notifications**: Beautiful, contextual reminder messages with emojis

### 📱 User Experience
- **Interactive Keyboards**: Inline buttons for easy navigation
- **Step-by-step Wizards**: Guided reminder creation process
- **Real-time Updates**: Live status updates and confirmations
- **Pagination**: Efficient browsing of large reminder lists
- **Quick Actions**: Snooze, complete, edit, and delete reminders

### 👑 Admin Features
- **Comprehensive Statistics**: User metrics, system status, and performance data
- **User Management**: Ban/unban users, promote/demote admins
- **Broadcast Messages**: Send announcements to all users
- **System Monitoring**: Database status, memory usage, uptime tracking
- **Backup & Recovery**: Automated data backup capabilities

### 🛡️ Security & Performance
- **Rate Limiting**: Prevent spam and abuse
- **Authentication**: Secure user verification and session management
- **Error Handling**: Comprehensive error tracking and recovery
- **Logging**: Detailed activity logs for debugging and monitoring
- **Scalability**: Optimized for high user volumes

## 🚀 Installation

### Prerequisites
- Node.js 18+ 
- MongoDB 4.4+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/telegram-reminder-bot.git
cd telegram-reminder-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the bot**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BOT_TOKEN` | Telegram Bot Token | ✅ | - |
| `MONGODB_URI` | MongoDB connection string | ✅ | - |
| `WEBHOOK_URL` | Webhook URL for production | ❌ | - |
| `ADMIN_IDS` | Comma-separated admin user IDs | ❌ | - |
| `DEFAULT_LANGUAGE` | Default bot language (ar/en) | ❌ | ar |
| `TIMEZONE` | Default timezone | ❌ | Asia/Damascus |
| `PORT` | Server port | ❌ | 3000 |
| `NODE_ENV` | Environment mode | ❌ | development |
| `LOG_LEVEL` | Logging level | ❌ | info |

### Creating a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Save the bot token to your `.env` file
4. Configure bot settings using `/setcommands`:

```
start - Start using the bot
help - Show help information
remind - Create a new reminder
list - View active reminders
settings - Account settings
language - Change language
timezone - Set timezone
```

## 📖 Usage

### Basic Commands

#### User Commands
- `/start` - Initialize bot and register user
- `/help` - Interactive help menu
- `/remind` - Create reminder wizard
- `/list` - View active reminders
- `/settings` - User preferences
- `/language` - Change language (Arabic/English)
- `/timezone` - Set timezone

#### Admin Commands
- `/stats` - System statistics
- `/broadcast` - Send message to all users
- `/users` - User management
- `/logs` - View error logs
- `/backup` - Database backup

### Creating Reminders

1. Send `/remind` to start the wizard
2. Enter reminder title
3. Add optional description
4. Set date and time
5. Choose recurrence pattern (if needed)
6. Select priority level
7. Confirm and save

### Reminder Management

- **View**: Use `/list` to see all active reminders
- **Complete**: Mark reminders as done
- **Snooze**: Postpone for 10 minutes
- **Edit**: Modify reminder details
- **Delete**: Remove unwanted reminders

## 🐳 Deployment

### Railway (Recommended)

1. **Fork this repository**
2. **Connect to Railway**
   - Visit [railway.app](https://railway.app)
   - Connect your GitHub account
   - Select this repository

3. **Configure environment variables**
   - Add your bot token and MongoDB URI
   - Set other required variables

4. **Deploy**
   - Railway will automatically build and deploy
   - Set up webhooks for production

### Docker

```bash
# Build image
docker build -t telegram-reminder-bot .

# Run container
docker run -d \
  --name reminder-bot \
  -p 3000:3000 \
  --env-file .env \
  telegram-reminder-bot
```

### Manual Deployment

```bash
# Clone and setup
git clone <repository>
cd telegram-reminder-bot
npm install

# Set production environment
export NODE_ENV=production
export BOT_TOKEN=your_token
export MONGODB_URI=your_mongodb_uri

# Start with PM2
npm install -g pm2
pm2 start src/index.js --name "reminder-bot"
```

## 🏗️ Architecture

### Project Structure
```
telegram-reminder-bot/
├── src/
│   ├── bot/              # Bot logic
│   │   ├── handlers/     # Command and callback handlers
│   │   ├── middlewares/  # Authentication and rate limiting
│   │   └── utils/        # Keyboards and utilities
│   ├── database/         # Database models and connection
│   ├── services/         # Business logic services
│   ├── config/           # Configuration files
│   └── utils/            # Shared utilities
├── locales/              # Translation files
├── logs/                 # Log files
└── scripts/              # Utility scripts
```

### Key Components

- **Database Models**: User and Reminder schemas with MongoDB
- **Internationalization**: i18next with Arabic RTL support
- **Scheduler**: node-cron for reminder execution
- **Logging**: Winston for comprehensive logging
- **Middlewares**: Authentication, rate limiting, error handling

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Add tests if applicable**
5. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Add JSDoc comments for functions
- Include error handling
- Update translations for new features
- Test with both Arabic and English

## 📋 API Documentation

### Health Check
```
GET /health
```
Returns bot status and system information.

### Webhook Endpoint
```
POST /webhook
```
Receives Telegram updates (production only).

## 🐛 Troubleshooting

### Common Issues

**Bot not responding**
- Check bot token validity
- Verify MongoDB connection
- Check logs for errors

**Reminders not executing**
- Ensure scheduler service is running
- Check timezone configuration
- Verify cron job setup

**Database connection issues**
- Verify MongoDB URI
- Check network connectivity
- Review connection settings

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
npm start
```

## 📊 Monitoring

### Logs
- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Daily logs: `logs/daily.log`

### Metrics
- Response time tracking
- Memory usage monitoring
- Database query performance
- Scheduler execution stats

## 🔒 Security

- Input validation on all user data
- Rate limiting to prevent abuse
- Secure session management
- Admin verification system
- GDPR-compliant data handling

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Telegraf](https://telegraf.js.org/) - Modern Telegram bot framework
- [i18next](https://www.i18next.com/) - Internationalization framework
- [MongoDB](https://www.mongodb.com/) - Database platform
- [Winston](https://github.com/winstonjs/winston) - Logging library

## 📞 Support

- 📧 Email: support@yourbot.com
- 💬 Telegram: [@YourBotSupport](https://t.me/YourBotSupport)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/telegram-reminder-bot/issues)

---

<div align="center">
Made with ❤️ for the Telegram community
</div>
