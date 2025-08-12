const mongoose = require('mongoose');
const moment = require('moment-timezone');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String,
    trim: true,
    lowercase: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  language: {
    type: String,
    enum: ['ar', 'en'],
    default: 'ar'
  },
  timezone: {
    type: String,
    default: 'Asia/Damascus',
    validate: {
      validator: function(tz) {
        return moment.tz.zone(tz) !== null;
      },
      message: 'Invalid timezone'
    }
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    trim: true
  },
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    reminderSound: {
      type: Boolean,
      default: true
    },
    defaultReminderTime: {
      type: String,
      default: '09:00'
    },
    maxReminders: {
      type: Number,
      default: 50
    }
  },
  stats: {
    totalReminders: {
      type: Number,
      default: 0
    },
    completedReminders: {
      type: Number,
      default: 0
    },
    lastReminderDate: Date,
    joinDate: {
      type: Date,
      default: Date.now
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for reminder count
userSchema.virtual('reminderCount', {
  ref: 'Reminder',
  localField: '_id',
  foreignField: 'userId',
  count: true
});

// Virtual for active reminders
userSchema.virtual('activeReminders', {
  ref: 'Reminder',
  localField: '_id',
  foreignField: 'userId',
  match: { isActive: true }
});

// Indexes for performance
userSchema.index({ telegramId: 1 });
userSchema.index({ isAdmin: 1 });
userSchema.index({ language: 1 });
userSchema.index({ lastActive: 1 });
userSchema.index({ 'stats.joinDate': 1 });

// Instance methods
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

userSchema.methods.incrementReminderCount = function() {
  this.stats.totalReminders += 1;
  this.stats.lastReminderDate = new Date();
  return this.save();
};

userSchema.methods.incrementCompletedReminders = function() {
  this.stats.completedReminders += 1;
  return this.save();
};

userSchema.methods.getFormattedName = function() {
  if (this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName;
};

userSchema.methods.getDisplayName = function() {
  const name = this.getFormattedName();
  if (this.username) {
    return `${name} (@${this.username})`;
  }
  return name;
};

userSchema.methods.canCreateReminder = function() {
  return !this.isBanned && this.isActive && 
         this.stats.totalReminders < this.settings.maxReminders;
};

userSchema.methods.getLocalTime = function(utcTime = new Date()) {
  return moment.tz(utcTime, this.timezone);
};

userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.__v;
  return userObject;
};

// Static methods
userSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId });
};

userSchema.statics.findAdmins = function() {
  return this.find({ isAdmin: true, isActive: true });
};

userSchema.statics.getActiveUsersCount = function() {
  return this.countDocuments({ isActive: true, isBanned: false });
};

userSchema.statics.getUsersStats = function() {
  return this.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        totalReminders: { $sum: '$stats.totalReminders' },
        totalCompleted: { $sum: '$stats.completedReminders' },
        averageReminders: { $avg: '$stats.totalReminders' },
        languageDistribution: {
          $push: '$language'
        }
      }
    }
  ]);
};

userSchema.statics.findInactiveUsers = function(days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return this.find({
    lastActive: { $lt: cutoffDate },
    isActive: true
  });
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Post-save middleware for logging
userSchema.post('save', function(doc) {
  if (this.isNew) {
    console.log(`New user registered: ${doc.getDisplayName()}`);
  }
});

module.exports = mongoose.model('User', userSchema);