# Mouin-Almojtahidin Telegram Bot 🎓

A comprehensive educational course management Telegram bot designed for the Mouin-Almojtahidin project. This bot provides bilingual support (Arabic/English) and offers features for course management, assignment tracking, attendance recording, custom reminders, and administrative tools.

## 🌟 Features

### User Features
- **🚀 User Registration & Verification**: Secure account verification system
- **👤 Profile Management**: View and manage personal profile and statistics
- **📚 Course Management**: Browse available courses and view details
- **📝 Assignment Tracking**: View assignments with due dates and urgency indicators
- **📅 Attendance Recording**: Record attendance for lessons with lesson IDs
- **🔔 Smart Reminders**: Toggle notifications and set custom reminders
- **💬 Feedback System**: Submit feedback and suggestions to administrators
- **⚙️ Customizable Settings**: Interactive settings menu with language and notification preferences
- **❓ Help & FAQ**: Comprehensive help system and frequently asked questions
- **🌐 Bilingual Support**: Full Arabic and English language support

### Admin Features
- **🏥 Health Monitoring**: Real-time bot health and system status
- **📊 Analytics & Statistics**: Detailed usage statistics and user analytics
- **📢 Broadcast Messages**: Send announcements to all verified users
- **👥 User Management**: View user feedback and manage user data
- **📚 Course Administration**: Add, update, and manage courses
- **📝 Assignment Management**: Create and manage assignments
- **📤 Data Export**: Export user data, feedback, and attendance as CSV
- **🔒 Security Features**: Rate limiting and input validation

## 🏗️ Project Structure

```
mouin-almojtahidin-bot/
├── bot/
│   ├── commands/           # Command handlers
│   │   ├── start.py       # User registration and welcome
│   │   ├── verify.py      # Account verification
│   │   ├── profile.py     # User profile display
│   │   ├── courses.py     # Course listing
│   │   ├── assignments.py # Assignment tracking
│   │   ├── attendance.py  # Attendance recording
│   │   ├── reminders.py   # Reminder management
│   │   ├── addreminder.py # Custom reminder creation
│   │   ├── listreminders.py # Reminder listing
│   │   ├── deletereminder.py # Reminder deletion
│   │   ├── feedback.py    # Feedback submission
│   │   ├── settings.py    # Settings management
│   │   ├── help.py        # Help system
│   │   ├── faq.py         # FAQ system
│   │   ├── health.py      # System health (admin)
│   │   ├── stats.py       # Analytics (admin)
│   │   ├── viewfeedback.py # Feedback viewing (admin)
│   │   ├── broadcast.py   # Message broadcasting (admin)
│   │   ├── addcourse.py   # Course creation (admin)
│   │   ├── prerequisites.py # Course prerequisites
│   │   ├── export.py      # Data export (admin)
│   │   └── publish.py     # Course publishing (admin)
│   ├── utils/             # Utility modules
│   │   ├── database.py    # SQLite database operations
│   │   ├── markdown.py    # MarkdownV2 formatting utilities
│   │   ├── security.py    # Input validation and sanitization
│   │   └── logger.py      # Logging system
│   └── middlewares/       # Middleware functions
│       ├── verify.py      # User verification middleware
│       └── ratelimit.py   # Rate limiting middleware
├── data/                  # Database and logs directory
│   ├── mouin_almojtahidin.db # SQLite database
│   ├── combined.log       # Application logs
│   └── error.log          # Error logs
├── config.py             # Configuration management
├── main.py               # Bot entry point
├── requirements.txt      # Python dependencies
├── Procfile             # Deployment configuration
├── .env.example         # Environment variables template
└── README.md            # This documentation
```

## 🗄️ Database Schema

The bot uses SQLite with the following tables:

### Users Table
```sql
users (
    user_id INTEGER PRIMARY KEY,           -- Telegram user ID
    username TEXT,                         -- Telegram username
    first_name TEXT,                       -- User's first name
    join_date TEXT NOT NULL,               -- Registration date (ISO format)
    is_verified INTEGER DEFAULT 0,        -- Verification status (0/1)
    verification_code TEXT,                -- Used verification code
    reminders_enabled INTEGER DEFAULT 1,   -- Reminders preference (0/1)
    language TEXT DEFAULT 'ar',            -- UI language (ar/en)
    notification_frequency TEXT DEFAULT 'daily' -- Notification frequency
)
```

### Courses Table
```sql
courses (
    course_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                    -- Course name
    description TEXT,                      -- Course description
    start_date TEXT,                       -- Course start date
    end_date TEXT                          -- Course end date
)
```

### Assignments Table
```sql
assignments (
    assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,           -- Foreign key to courses
    title TEXT NOT NULL,                  -- Assignment title
    due_date TEXT,                        -- Assignment due date
    FOREIGN KEY (course_id) REFERENCES courses (course_id)
)
```

### Feedback Table
```sql
feedback (
    feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,             -- Foreign key to users
    username TEXT,                        -- Username for reference
    message TEXT NOT NULL,                -- Feedback message
    created_at TEXT NOT NULL,             -- Submission timestamp
    FOREIGN KEY (user_id) REFERENCES users (user_id)
)
```

### Reminders Table
```sql
reminders (
    reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,             -- Foreign key to users
    reminder_datetime TEXT NOT NULL,      -- Reminder date and time
    message TEXT NOT NULL,                -- Reminder message
    FOREIGN KEY (user_id) REFERENCES users (user_id)
)
```

### Attendance Table
```sql
attendance (
    attendance_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,             -- Foreign key to users
    course_id INTEGER NOT NULL,           -- Foreign key to courses
    lesson_id TEXT NOT NULL,              -- Lesson identifier
    attendance_date TEXT NOT NULL,        -- Attendance timestamp
    FOREIGN KEY (user_id) REFERENCES users (user_id),
    FOREIGN KEY (course_id) REFERENCES courses (course_id)
)
```

## 🚀 Setup Instructions

### Prerequisites
- Python 3.8 or higher
- Telegram bot token (from @BotFather)
- Basic understanding of Telegram bots

### 1. Clone and Setup
```bash
# Create project directory
mkdir mouin-almojtahidin-bot
cd mouin-almojtahidin-bot

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your configuration
nano .env
```

### 3. Configure Environment Variables
Edit the `.env` file with your settings:

```env
# Telegram Bot Configuration
BOT_TOKEN=your_bot_token_from_botfather
BOT_NAME=@YourBotUsername

# Environment
NODE_ENV=development

# Admin Configuration
ADMIN_USER_IDS=123456789,987654321  # Your Telegram user IDs
ADMIN_CHAT_ID=123456789             # Admin chat for notifications
SUPPORT_CHANNEL=@your_support_channel

# Rate Limiting
RATE_LIMITING_ENABLED=true
RATE_LIMITING_MAX_REQUESTS_PER_MINUTE=30
RATE_LIMITING_MAX_REQUESTS_PER_HOUR=100

# Webhook Configuration (for production)
WEBHOOK_DOMAIN=https://your-app.onrender.com
PORT=3000

# Logging
LOG_LEVEL=INFO
```

### 4. Run Locally
```bash
# Start the bot in development mode (polling)
python main.py
```

## 🌐 Deployment

### Render Deployment
1. **Create Render Account**: Sign up at [render.com](https://render.com)

2. **Connect Repository**: Link your GitHub repository

3. **Configure Service**:
   - Service Type: Web Service
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python main.py`

4. **Environment Variables**: Add all variables from `.env.example`

5. **Deploy**: Render will automatically deploy your bot

### Heroku Deployment
1. **Install Heroku CLI**: Download from [heroku.com](https://heroku.com)

2. **Create Heroku App**:
   ```bash
   heroku create your-bot-name
   ```

3. **Set Environment Variables**:
   ```bash
   heroku config:set BOT_TOKEN=your_token
   heroku config:set NODE_ENV=production
   # ... add all other variables
   ```

4. **Deploy**:
   ```bash
   git push heroku main
   ```

### Production Configuration
- Set `NODE_ENV=production`
- Configure `WEBHOOK_DOMAIN` with your deployment URL
- Ensure `BOT_TOKEN` and `ADMIN_USER_IDS` are set correctly
- Monitor logs: `heroku logs --tail` or Render dashboard

## 📝 Command Reference

### User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Register and welcome message | `/start` |
| `/verify <code>` | Verify account | `/verify free_palestine1447` |
| `/profile` | View profile and statistics | `/profile` |
| `/courses` | List available courses | `/courses` |
| `/assignments` | View assignments and deadlines | `/assignments` |
| `/attendance <lesson_id>` | Record lesson attendance | `/attendance lesson_001` |
| `/reminders` | Toggle reminder notifications | `/reminders` |
| `/addreminder <date> <time> <message>` | Add custom reminder | `/addreminder 2025-08-15 14:30 Study for exam` |
| `/listreminders` | List your reminders | `/listreminders` |
| `/deletereminder <id>` | Delete a reminder | `/deletereminder 5` |
| `/feedback <message>` | Submit feedback | `/feedback Great course!` |
| `/settings [setting] [value]` | Manage preferences | `/settings language en` |
| `/help` | Show help information | `/help` |
| `/faq` | Frequently asked questions | `/faq` |
| `/prerequisites <course_id>` | Show course requirements | `/prerequisites 1` |

### Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/health` | Bot health status | `/health` |
| `/stats` | Usage statistics | `/stats` |
| `/viewfeedback` | View all feedback | `/viewfeedback` |
| `/broadcast <message>` | Send message to all users | `/broadcast Welcome everyone!` |
| `/addcourse <name> [desc] [start] [end]` | Add new course | `/addcourse "Python" "Learn Python" 2025-09-01 2025-12-15` |
| `/export [type]` | Export data as CSV | `/export feedback` |
| `/publish` | Publish course updates | `/publish` |

### Settings Commands
```bash
# Change language
/settings language en          # English
/settings language ar          # Arabic

# Toggle reminders
/settings reminders true       # Enable
/settings reminders false      # Disable

# Notification frequency
/settings frequency daily      # Daily notifications
/settings frequency weekly     # Weekly notifications
/settings frequency off        # No notifications
```

## 🧪 Testing

### Basic Testing
1. **Start the bot**: `python main.py`
2. **Send commands to your bot**:
   ```
   /start
   /verify free_palestine1447
   /profile
   /courses
   /help
   ```

### Testing Reminders
```bash
# Add a reminder for 5 minutes from now
/addreminder 2025-08-10 14:05 Test reminder

# List reminders
/listreminders

# Delete reminder
/deletereminder 1
```

### Testing Settings
```bash
# Test language change
/settings language en
/profile
/settings language ar
/profile

# Test reminders toggle
/reminders
```

### Admin Testing
```bash
# Add yourself as admin in .env first
/health
/stats
/addcourse "Test Course" "Test Description"
/broadcast Test message to all users
/export users
```

## 🛠️ Development

### Adding New Commands
1. **Create command file**: `bot/commands/newcommand.py`
2. **Import in main.py**: Add import and handler registration
3. **Add to bot commands**: Update `set_bot_commands()` function

### Database Operations
```python
from bot.utils.database import db

# Add user
result = db.add_user(user_id, username, first_name)

# Get user
user_result = db.get_user(user_id)

# Update setting
db.update_user_setting(user_id, 'language', 'en')
```

### Markdown Formatting
```python
from bot.utils.markdown import md, MessageBuilder

# Simple formatting
text = md.bold("Bold text")
text = md.code("Code text")
text = md.success_message("Success!")

# Message building
builder = MessageBuilder()
builder.add_header("Title", 1)
builder.add_bullet("Item 1", "🔸")
message = builder.build()
```

## 📊 Monitoring

### Logs
- **Combined logs**: `./data/combined.log`
- **Error logs**: `./data/error.log`
- **Console output**: Real-time logging to stdout

### Health Monitoring
- Use `/health` command for system status
- Check database connectivity
- Monitor memory and CPU usage
- View rate limiting statistics

### Analytics
- Use `/stats` for user statistics
- Monitor verification rates
- Track feature usage
- Export data for analysis

## 🔧 Troubleshooting

### Common Issues

**Bot not responding**:
- Check bot token validity
- Verify network connectivity
- Check logs for errors

**Database errors**:
- Ensure `data/` directory exists
- Check file permissions
- Verify SQLite installation

**Webhook issues (production)**:
- Verify webhook URL is accessible
- Check SSL certificate
- Confirm port configuration

**Rate limiting**:
- Adjust limits in configuration
- Check user request patterns
- Monitor rate limit logs

### Error Messages
- **"User not verified"**: Use `/verify free_palestine1447`
- **"Admin only"**: Command restricted to administrators
- **"Database error"**: Check database connectivity
- **"Invalid format"**: Check command syntax

## 🚧 Roadmap

### Planned Features
- [ ] Enhanced course management with modules
- [ ] Assignment submission system
- [ ] Grade tracking and reporting
- [ ] Advanced reminder scheduling
- [ ] Calendar integration
- [ ] Mobile app companion
- [ ] Advanced analytics dashboard
- [ ] Multi-language course content

### Contributing
1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Submit pull request
5. Ensure all tests pass

## 📄 License

This project is licensed under the MIT License. See LICENSE file for details.

## 👥 Support

- **Telegram Support**: Contact via the configured support channel
- **Issues**: Report bugs via GitHub issues
- **Documentation**: Refer to this README for comprehensive guidance
- **Admin Commands**: Use `/help` for immediate assistance

## 🙏 Acknowledgments

- Built with [python-telegram-bot](https://github.com/python-telegram-bot/python-telegram-bot)
- Designed for the Mouin-Almojtahidin educational project
- Supports Arabic and English-speaking communities
- Focused on simplicity, reliability, and user experience

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Maintainer**: Assistant  
**Status**: Production Ready ✅