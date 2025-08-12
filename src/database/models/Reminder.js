const mongoose = require('mongoose');
const moment = require('moment-timezone');

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  scheduledTime: {
    type: Date,
    required: true,
    index: true
  },
  originalScheduledTime: {
    type: Date,
    required: true
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
    required: function() {
      return this.isRecurring;
    }
  },
  recurringInterval: {
    type: Number,
    default: 1,
    min: 1
  },
  recurringDays: [{
    type: Number,
    min: 0,
    max: 6
  }],
  maxRecurrences: {
    type: Number,
    min: 1
  },
  recurrenceCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: Date,
  isSnoozed: {
    type: Boolean,
    default: false
  },
  snoozeUntil: Date,
  snoozeCount: {
    type: Number,
    default: 0
  },
  targetType: {
    type: String,
    enum: ['private', 'group', 'channel'],
    default: 'private'
  },
  targetId: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  category: {
    type: String,
    trim: true,
    maxlength: 50
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  timezone: {
    type: String,
    required: true
  },
  attachments: [{
    type: {
      type: String,
      enum: ['photo', 'document', 'audio', 'video', 'voice', 'sticker']
    },
    fileId: String,
    fileName: String,
    fileSize: Number
  }],
  notificationSettings: {
    enableSound: {
      type: Boolean,
      default: true
    },
    enableVibration: {
      type: Boolean,
      default: true
    },
    remindersBefore: [{
      type: Number,
      min: 1
    }]
  },
  executionHistory: [{
    executedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'snoozed'],
      required: true
    },
    error: String,
    nextExecution: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for user relationship
reminderSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for time until reminder
reminderSchema.virtual('timeUntil').get(function() {
  if (!this.scheduledTime) return null;
  const now = moment();
  const scheduled = moment(this.scheduledTime);
  return scheduled.diff(now);
});

// Virtual for formatted time
reminderSchema.virtual('formattedTime').get(function() {
  if (!this.scheduledTime || !this.timezone) return '';
  return moment.tz(this.scheduledTime, this.timezone).format('YYYY-MM-DD HH:mm');
});

// Virtual for is overdue
reminderSchema.virtual('isOverdue').get(function() {
  if (!this.scheduledTime || this.isCompleted) return false;
  return moment().isAfter(this.scheduledTime);
});

// Indexes for performance
reminderSchema.index({ userId: 1, isActive: 1 });
reminderSchema.index({ scheduledTime: 1, isActive: 1 });
reminderSchema.index({ targetId: 1, targetType: 1 });
reminderSchema.index({ isRecurring: 1 });
reminderSchema.index({ priority: 1 });
reminderSchema.index({ category: 1 });
reminderSchema.index({ createdAt: 1 });
reminderSchema.index({ tags: 1 });

// Compound indexes
reminderSchema.index({ userId: 1, scheduledTime: 1 });
reminderSchema.index({ isActive: 1, scheduledTime: 1 });
reminderSchema.index({ targetId: 1, isActive: 1 });

// Instance methods
reminderSchema.methods.snooze = function(minutes = 10) {
  this.isSnoozed = true;
  this.snoozeUntil = moment().add(minutes, 'minutes').toDate();
  this.snoozeCount += 1;
  return this.save();
};

reminderSchema.methods.complete = function() {
  this.isCompleted = true;
  this.completedAt = new Date();
  this.isActive = false;
  return this.save();
};

reminderSchema.methods.reschedule = function(newTime) {
  this.scheduledTime = newTime;
  this.isSnoozed = false;
  this.snoozeUntil = null;
  return this.save();
};

reminderSchema.methods.addExecutionHistory = function(status, error = null, nextExecution = null) {
  this.executionHistory.push({
    status,
    error,
    nextExecution
  });
  
  // Keep only last 10 execution records
  if (this.executionHistory.length > 10) {
    this.executionHistory = this.executionHistory.slice(-10);
  }
  
  return this.save();
};

reminderSchema.methods.calculateNextRecurrence = function() {
  if (!this.isRecurring) return null;
  
  const current = moment.tz(this.scheduledTime, this.timezone);
  let next;
  
  switch (this.recurringPattern) {
    case 'daily':
      next = current.clone().add(this.recurringInterval, 'days');
      break;
    case 'weekly':
      next = current.clone().add(this.recurringInterval, 'weeks');
      break;
    case 'monthly':
      next = current.clone().add(this.recurringInterval, 'months');
      break;
    case 'yearly':
      next = current.clone().add(this.recurringInterval, 'years');
      break;
    default:
      return null;
  }
  
  return next.toDate();
};

reminderSchema.methods.createNextRecurrence = async function() {
  if (!this.isRecurring) return null;
  
  const nextTime = this.calculateNextRecurrence();
  if (!nextTime) return null;
  
  // Check if we've reached max recurrences
  if (this.maxRecurrences && this.recurrenceCount >= this.maxRecurrences) {
    this.isActive = false;
    await this.save();
    return null;
  }
  
  const nextReminder = new this.constructor({
    userId: this.userId,
    title: this.title,
    message: this.message,
    scheduledTime: nextTime,
    originalScheduledTime: this.originalScheduledTime,
    isRecurring: this.isRecurring,
    recurringPattern: this.recurringPattern,
    recurringInterval: this.recurringInterval,
    recurringDays: this.recurringDays,
    maxRecurrences: this.maxRecurrences,
    recurrenceCount: this.recurrenceCount + 1,
    targetType: this.targetType,
    targetId: this.targetId,
    priority: this.priority,
    category: this.category,
    tags: this.tags,
    timezone: this.timezone,
    notificationSettings: this.notificationSettings
  });
  
  return await nextReminder.save();
};

reminderSchema.methods.getLocalScheduledTime = function() {
  if (!this.scheduledTime || !this.timezone) return null;
  return moment.tz(this.scheduledTime, this.timezone);
};

reminderSchema.methods.shouldExecute = function() {
  if (!this.isActive || this.isCompleted) return false;
  if (this.isSnoozed && moment().isBefore(this.snoozeUntil)) return false;
  return moment().isSameOrAfter(this.scheduledTime);
};

reminderSchema.methods.toSafeObject = function() {
  const reminderObject = this.toObject();
  delete reminderObject.__v;
  return reminderObject;
};

// Static methods
reminderSchema.statics.findUpcoming = function(userId, limit = 10) {
  return this.find({
    userId,
    isActive: true,
    isCompleted: false,
    scheduledTime: { $gte: new Date() }
  })
  .sort({ scheduledTime: 1 })
  .limit(limit);
};

reminderSchema.statics.findOverdue = function(userId) {
  return this.find({
    userId,
    isActive: true,
    isCompleted: false,
    scheduledTime: { $lt: new Date() }
  })
  .sort({ scheduledTime: 1 });
};

reminderSchema.statics.findReadyToExecute = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    isCompleted: false,
    scheduledTime: { $lte: now },
    $or: [
      { isSnoozed: false },
      { isSnoozed: true, snoozeUntil: { $lte: now } }
    ]
  })
  .populate('userId')
  .sort({ priority: -1, scheduledTime: 1 });
};

reminderSchema.statics.getStatsByUser = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        completed: { $sum: { $cond: ['$isCompleted', 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$isActive',
                  { $not: '$isCompleted' },
                  { $lt: ['$scheduledTime', new Date()] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

reminderSchema.statics.findByCategory = function(userId, category) {
  return this.find({
    userId,
    category,
    isActive: true
  }).sort({ scheduledTime: 1 });
};

reminderSchema.statics.findByTags = function(userId, tags) {
  return this.find({
    userId,
    tags: { $in: tags },
    isActive: true
  }).sort({ scheduledTime: 1 });
};

// Pre-save middleware
reminderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set original scheduled time if not set
  if (!this.originalScheduledTime) {
    this.originalScheduledTime = this.scheduledTime;
  }
  
  next();
});

// Pre-remove middleware
reminderSchema.pre('remove', function(next) {
  this.deletedAt = new Date();
  next();
});

module.exports = mongoose.model('Reminder', reminderSchema);