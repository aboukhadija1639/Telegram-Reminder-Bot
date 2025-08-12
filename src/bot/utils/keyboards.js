const { Markup } = require('telegraf');
const { translate, isRTL } = require('../../config/i18n');

/**
 * Create language selection keyboard
 * @param {string} currentLang - Current user language
 * @returns {object} Inline keyboard markup
 */
function createLanguageKeyboard(currentLang = 'ar') {
  const t = (key, options) => translate(currentLang, key, options);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${currentLang === 'ar' ? '✅ ' : ''}🇸🇦 العربية`,
        'lang_ar'
      ),
      Markup.button.callback(
        `${currentLang === 'en' ? '✅ ' : ''}🇺🇸 English`,
        'lang_en'
      )
    ]
  ]);
}

/**
 * Create timezone selection keyboard
 * @param {string} lang - User language
 * @param {string} currentTimezone - Current user timezone
 * @returns {object} Inline keyboard markup
 */
function createTimezoneKeyboard(lang = 'ar', currentTimezone = 'Asia/Damascus') {
  const t = (key, options) => translate(lang, key, options);
  
  const timezones = [
    { code: 'Asia/Riyadh', key: 'riyadh' },
    { code: 'Asia/Dubai', key: 'dubai' },
    { code: 'Africa/Cairo', key: 'cairo' },
    { code: 'Asia/Damascus', key: 'damascus' },
    { code: 'Asia/Baghdad', key: 'baghdad' },
    { code: 'Asia/Beirut', key: 'beirut' },
    { code: 'Asia/Amman', key: 'amman' },
    { code: 'Asia/Kuwait', key: 'kuwait' },
    { code: 'Asia/Qatar', key: 'doha' },
    { code: 'Asia/Bahrain', key: 'manama' }
  ];
  
  const buttons = timezones.map(tz => {
    const isSelected = tz.code === currentTimezone;
    const text = `${isSelected ? '✅ ' : ''}${t(`timezone.${tz.key}`)}`;
    return [Markup.button.callback(text, `tz_${tz.code}`)];
  });
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * Create reminder priority keyboard
 * @param {string} lang - User language
 * @param {string} selectedPriority - Currently selected priority
 * @returns {object} Inline keyboard markup
 */
function createPriorityKeyboard(lang = 'ar', selectedPriority = 'normal') {
  const t = (key, options) => translate(lang, key, options);
  
  const priorities = [
    { value: 'low', key: 'priority_low' },
    { value: 'normal', key: 'priority_normal' },
    { value: 'high', key: 'priority_high' },
    { value: 'urgent', key: 'priority_urgent' }
  ];
  
  const buttons = priorities.map(priority => {
    const isSelected = priority.value === selectedPriority;
    const text = `${isSelected ? '✅ ' : ''}${t(`reminder.${priority.key}`)}`;
    return [Markup.button.callback(text, `priority_${priority.value}`)];
  });
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * Create recurrence pattern keyboard
 * @param {string} lang - User language
 * @param {string} selectedPattern - Currently selected pattern
 * @returns {object} Inline keyboard markup
 */
function createRecurrenceKeyboard(lang = 'ar', selectedPattern = null) {
  const t = (key, options) => translate(lang, key, options);
  
  const patterns = [
    { value: 'no', key: 'recurring_no' },
    { value: 'daily', key: 'recurring_daily' },
    { value: 'weekly', key: 'recurring_weekly' },
    { value: 'monthly', key: 'recurring_monthly' }
  ];
  
  const buttons = patterns.map(pattern => {
    const isSelected = pattern.value === selectedPattern;
    const text = `${isSelected ? '✅ ' : ''}${t(`reminder.${pattern.key}`)}`;
    return [Markup.button.callback(text, `recurrence_${pattern.value}`)];
  });
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * Create confirmation keyboard
 * @param {string} lang - User language
 * @param {string} yesAction - Callback data for yes button
 * @param {string} noAction - Callback data for no button
 * @returns {object} Inline keyboard markup
 */
function createConfirmationKeyboard(lang = 'ar', yesAction = 'confirm_yes', noAction = 'confirm_no') {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t('reminder.yes'), yesAction),
      Markup.button.callback(t('reminder.no'), noAction)
    ]
  ]);
}

/**
 * Create pagination keyboard
 * @param {string} lang - User language
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} baseAction - Base action for pagination callbacks
 * @returns {object} Inline keyboard markup
 */
function createPaginationKeyboard(lang = 'ar', currentPage = 1, totalPages = 1, baseAction = 'page') {
  const t = (key, options) => translate(lang, key, options);
  
  const buttons = [];
  
  // Previous button
  if (currentPage > 1) {
    buttons.push(Markup.button.callback(
      isRTL(lang) ? t('list.prev_page') : t('list.prev_page'),
      `${baseAction}_${currentPage - 1}`
    ));
  }
  
  // Page indicator
  buttons.push(Markup.button.callback(
    `${currentPage}/${totalPages}`,
    'page_info'
  ));
  
  // Next button
  if (currentPage < totalPages) {
    buttons.push(Markup.button.callback(
      isRTL(lang) ? t('list.next_page') : t('list.next_page'),
      `${baseAction}_${currentPage + 1}`
    ));
  }
  
  return Markup.inlineKeyboard([buttons]);
}

/**
 * Create reminder management keyboard
 * @param {string} lang - User language
 * @param {string} reminderId - Reminder ID
 * @returns {object} Inline keyboard markup
 */
function createReminderManagementKeyboard(lang = 'ar', reminderId) {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t('list.view_details'), `details_${reminderId}`),
      Markup.button.callback(t('list.edit'), `edit_${reminderId}`)
    ],
    [
      Markup.button.callback(t('list.complete'), `complete_${reminderId}`),
      Markup.button.callback(t('list.snooze'), `snooze_${reminderId}`)
    ],
    [
      Markup.button.callback(t('list.delete'), `delete_${reminderId}`)
    ],
    [
      Markup.button.callback(t('common.back'), 'back_to_list')
    ]
  ]);
}

/**
 * Create settings menu keyboard
 * @param {string} lang - User language
 * @returns {object} Inline keyboard markup
 */
function createSettingsKeyboard(lang = 'ar') {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t('settings.change_language'), 'settings_language'),
      Markup.button.callback(t('settings.change_timezone'), 'settings_timezone')
    ],
    [
      Markup.button.callback(t('settings.toggle_notifications'), 'settings_notifications'),
      Markup.button.callback(t('settings.set_default_time'), 'settings_default_time')
    ],
    [
      Markup.button.callback(t('settings.account_info'), 'settings_account'),
      Markup.button.callback(t('settings.export_data'), 'settings_export')
    ],
    [
      Markup.button.callback(t('settings.delete_account'), 'settings_delete')
    ]
  ]);
}

/**
 * Create admin menu keyboard
 * @param {string} lang - User language
 * @returns {object} Inline keyboard markup
 */
function createAdminKeyboard(lang = 'ar') {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t('help.stats'), 'admin_stats'),
      Markup.button.callback(t('help.users'), 'admin_users')
    ],
    [
      Markup.button.callback(t('help.broadcast'), 'admin_broadcast'),
      Markup.button.callback(t('help.logs'), 'admin_logs')
    ],
    [
      Markup.button.callback(t('help.backup'), 'admin_backup')
    ]
  ]);
}

/**
 * Create user management keyboard
 * @param {string} lang - User language
 * @param {string} userId - Target user ID
 * @param {boolean} isBanned - Whether user is banned
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {object} Inline keyboard markup
 */
function createUserManagementKeyboard(lang = 'ar', userId, isBanned = false, isAdmin = false) {
  const t = (key, options) => translate(lang, key, options);
  
  const buttons = [];
  
  // Ban/Unban button
  if (isBanned) {
    buttons.push([Markup.button.callback(t('admin.unban_user'), `unban_${userId}`)]);
  } else {
    buttons.push([Markup.button.callback(t('admin.ban_user'), `ban_${userId}`)]);
  }
  
  // Admin toggle button
  if (isAdmin) {
    buttons.push([Markup.button.callback(t('admin.remove_admin'), `deadmin_${userId}`)]);
  } else {
    buttons.push([Markup.button.callback(t('admin.make_admin'), `admin_${userId}`)]);
  }
  
  // Back button
  buttons.push([Markup.button.callback(t('common.back'), 'admin_users')]);
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * Create help menu keyboard
 * @param {string} lang - User language
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {object} Inline keyboard markup
 */
function createHelpKeyboard(lang = 'ar', isAdmin = false) {
  const t = (key, options) => translate(lang, key, options);
  
  const buttons = [
    [
      Markup.button.callback(`📝 ${t('help.remind')}`, 'help_remind'),
      Markup.button.callback(`📋 ${t('help.list')}`, 'help_list')
    ],
    [
      Markup.button.callback(`⚙️ ${t('help.settings')}`, 'help_settings'),
      Markup.button.callback(`🌐 ${t('help.language')}`, 'help_language')
    ]
  ];
  
  if (isAdmin) {
    buttons.push([
      Markup.button.callback(`👑 ${t('help.stats')}`, 'help_admin'),
      Markup.button.callback(`📊 ${t('help.users')}`, 'help_users')
    ]);
  }
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * Format reminder text with proper styling
 * @param {object} reminder - Reminder object
 * @param {string} lang - User language
 * @param {boolean} includeActions - Whether to include action buttons
 * @returns {object} Formatted message with keyboard
 */
function formatReminderMessage(reminder, lang = 'ar', includeActions = true) {
  const t = (key, options) => translate(lang, key, options);
  const { formatDate, formatTime } = require('../../config/i18n');
  
  const recurrenceText = reminder.isRecurring 
    ? `🔄 ${t(`reminder.recurring_${reminder.recurringPattern}`)}`
    : t('reminder.recurring_no');
    
  const priorityEmoji = {
    low: '🟢',
    normal: '🟡',
    high: '🟠',
    urgent: '🔴'
  };
  
  const statusEmoji = reminder.isOverdue ? '⚠️' : '⏳';
  
  let message = `${statusEmoji} **${reminder.title}**\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (reminder.message) {
    message += `💬 ${reminder.message}\n\n`;
  }
  
  message += `📅 ${formatDate(reminder.scheduledTime, lang)}\n`;
  message += `⏰ ${formatTime(reminder.scheduledTime, lang)}\n`;
  message += `${priorityEmoji[reminder.priority]} ${t(`reminder.priority_${reminder.priority}`)}\n`;
  message += `${recurrenceText}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━`;
  
  const keyboard = includeActions 
    ? createReminderManagementKeyboard(lang, reminder._id)
    : null;
    
  return { message, keyboard };
}

/**
 * Format user info message
 * @param {object} user - User object
 * @param {string} lang - Display language
 * @returns {string} Formatted user info
 */
function formatUserInfo(user, lang = 'ar') {
  const t = (key, options) => translate(lang, key, options);
  const { formatDate } = require('../../config/i18n');
  
  let message = `👤 **${user.getFormattedName()}**\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `${t('admin.user_id', { id: user.telegramId })}\n`;
  
  if (user.username) {
    message += `${t('admin.user_username', { username: user.username })}\n`;
  }
  
  message += `${t('admin.user_language', { language: user.language === 'ar' ? 'العربية' : 'English' })}\n`;
  message += `${t('admin.user_join_date', { date: formatDate(user.stats.joinDate, lang) })}\n`;
  message += `${t('admin.user_reminders_count', { count: user.stats.totalReminders })}\n`;
  
  if (user.isAdmin) {
    message += `👑 ${t('admin.make_admin')}\n`;
  }
  
  if (user.isBanned) {
    message += `🚫 ${t('admin.user_banned')}\n`;
    if (user.banReason) {
      message += `📝 ${user.banReason}\n`;
    }
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━`;
  
  return message;
}

/**
 * Create back button keyboard
 * @param {string} lang - User language
 * @param {string} action - Back action callback
 * @returns {object} Inline keyboard markup
 */
function createBackKeyboard(lang = 'ar', action = 'back') {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('common.back'), action)]
  ]);
}

/**
 * Create cancel keyboard
 * @param {string} lang - User language
 * @param {string} action - Cancel action callback
 * @returns {object} Inline keyboard markup
 */
function createCancelKeyboard(lang = 'ar', action = 'cancel') {
  const t = (key, options) => translate(lang, key, options);
  
  return Markup.inlineKeyboard([
    [Markup.button.callback(t('common.cancel'), action)]
  ]);
}

module.exports = {
  createLanguageKeyboard,
  createTimezoneKeyboard,
  createPriorityKeyboard,
  createRecurrenceKeyboard,
  createConfirmationKeyboard,
  createPaginationKeyboard,
  createReminderManagementKeyboard,
  createSettingsKeyboard,
  createAdminKeyboard,
  createUserManagementKeyboard,
  createHelpKeyboard,
  createBackKeyboard,
  createCancelKeyboard,
  formatReminderMessage,
  formatUserInfo
};