# 🔔 Telegram Reminder Bot
# Mouin-Almojtahidin Telegram Bot 🎓


> A powerful and modern Telegram bot designed for scheduling and managing reminders with multi-language support (Arabic & English)

## ✨ Features

### 🎯 Core Functionality
- **Smart Reminders**: Schedule one-time and recurring reminders
- **Multi-Channel Support**: Send reminders to groups and private messages
- **Dual Language**: Full Arabic and English language support
- **User Profiles**: Personalized settings and preferences
- **Admin Dashboard**: Complete control panel with statistics

### 👥 User Features
- Set personal reminders with custom messages
- Change language preference (العربية/English)
- Manage reminder history
- Timezone support
- Rich message formatting with emojis

### 🛡️ Admin Features
- Broadcast messages to all users
- View bot statistics and analytics
- Manage user permissions
- Monitor bot performance
- Export user data

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Database (MongoDB/PostgreSQL)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/telegram-reminder-bot.git
   cd telegram-reminder-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
4. **Configure environment variables**
   ```env
   BOT_TOKEN=your_telegram_bot_token
   DATABASE_URL=your_database_connection_string
   ADMIN_IDS=comma_separated_admin_telegram_ids
   DEFAULT_LANGUAGE=ar
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## 📁 Project Structure

```
telegram-reminder-bot/
├── src/
│   ├── bot/
│   │   ├── handlers/          # Message and command handlers
│   │   ├── middlewares/       # Bot middlewares
│   │   └── scenes/            # Conversation scenes
│   ├── database/
│   │   ├── models/            # Database models
│   │   └── migrations/        # Database migrations
│   ├── services/
│   │   ├── reminder.js        # Reminder scheduling logic
│   │   ├── notification.js    # Message sending service
│   │   └── i18n.js           # Internationalization
│   ├── utils/
│   │   ├── logger.js          # Logging utility
│   │   ├── formatters.js      # Message formatters
│   │   └── validators.js      # Input validators
│   └── config/
│       └── database.js        # Database configuration
├── locales/
│   ├── ar.json               # Arabic translations
│   └── en.json               # English translations
├── tests/                    # Unit and integration tests
├── docs/                     # Documentation
└── scripts/                  # Deployment scripts
```

## 🎮 Bot Commands

### User Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Initialize bot and user registration | `/start` |
| `/help` | Show available commands | `/help` |
| `/remind` | Create a new reminder | `/remind` |
| `/list` | View all active reminders | `/list` |
| `/settings` | Change user preferences | `/settings` |
| `/language` | Switch language (ar/en) | `/language` |

### Admin Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/stats` | View bot statistics | `/stats` |
| `/broadcast` | Send message to all users | `/broadcast Hello everyone!` |
| `/users` | List all registered users | `/users` |
| `/ban` | Ban a user from the bot | `/ban @username` |
| `/backup` | Create data backup | `/backup` |

## 🌐 Deployment

### Free Hosting Options

#### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### Render
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically

#### Vercel (Serverless)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Environment Variables
```env
# Required
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=your_database_url

# Optional
NODE_ENV=production
PORT=3000
ADMIN_IDS=123456789,987654321
DEFAULT_TIMEZONE=Asia/Damascus
LOG_LEVEL=info
```

## 🛠️ Development

### Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with hot reload
npm test           # Run tests
npm run lint       # Run linting
npm run build      # Build for production
```

### Database Setup
```bash
# MongoDB
npm run db:migrate

# PostgreSQL
npm run db:setup
npm run db:seed
```

## 📊 Features Roadmap

- [x] Basic reminder functionality
- [x] Multi-language support
- [x] Admin panel
- [ ] Recurring reminders
- [ ] Rich media support (photos, files)
- [ ] Calendar integration
- [ ] Voice message reminders
- [ ] Web dashboard
- [ ] API endpoints
- [ ] Webhook support

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Wiki](../../wiki)
- **Issues**: [GitHub Issues](../../issues)
- **Discussions**: [GitHub Discussions](../../discussions)
- **Telegram**: [@YourBotSupport](https://t.me/yourbotusername)

## 👨‍💻 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)
- Telegram: [@yourusername](https://t.me/yourusername)

## 🙏 Acknowledgments

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) for the excellent Telegram Bot API wrapper
- [node-cron](https://github.com/node-cron/node-cron) for scheduling functionality
- [i18next](https://github.com/i18next/i18next) for internationalization

## 📈 Statistics

![GitHub stars](https://img.shields.io/github/stars/yourusername/telegram-reminder-bot?style=social)
![GitHub forks](https://img.shields.io/github/forks/yourusername/telegram-reminder-bot?style=social)
![GitHub issues](https://img.shields.io/github/issues/yourusername/telegram-reminder-bot)
![GitHub license](https://img.shields.io/github/license/yourusername/telegram-reminder-bot)

---

<div align="center">
  Made with ❤️ for the Telegram community
</div>
