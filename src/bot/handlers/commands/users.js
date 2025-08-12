const logger = require('../../../utils/logger');
const User = require('../../../database/models/User');
const Reminder = require('../../../database/models/Reminder');
const moment = require('moment-timezone');
const { createPaginationKeyboard } = require('../../utils/keyboards');

async function usersHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Show user management menu
    await showUserManagement(ctx);
    
    logger.adminAction(user._id, 'users_command');
    
  } catch (error) {
    logger.error('Error in users command', error, {
      userId: ctx.user?._id
    });
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showUserManagement(ctx) {
  const t = ctx.t;
  
  // Get user statistics
  const stats = await getUserStatistics();
  
  const message = `👥 ${t('admin.users.title')}\n\n` +
    `📊 ${t('admin.users.statistics')}:\n` +
    `• ${t('admin.users.total_users')}: **${stats.totalUsers}**\n` +
    `• ${t('admin.users.active_users')}: **${stats.activeUsers}**\n` +
    `• ${t('admin.users.banned_users')}: **${stats.bannedUsers}**\n` +
    `• ${t('admin.users.admin_users')}: **${stats.adminUsers}**\n` +
    `• ${t('admin.users.today_registrations')}: **${stats.todayRegistrations}**\n` +
    `• ${t('admin.users.week_registrations')}: **${stats.weekRegistrations}**\n\n` +
    `📈 ${t('admin.users.activity')}:\n` +
    `• ${t('admin.users.total_reminders')}: **${stats.totalReminders}**\n` +
    `• ${t('admin.users.active_reminders')}: **${stats.activeReminders}**\n` +
    `• ${t('admin.users.completed_reminders')}: **${stats.completedReminders}**\n\n` +
    `🌍 ${t('admin.users.languages')}:\n` +
    `• ${t('admin.users.arabic_users')}: **${stats.arabicUsers}**\n` +
    `• ${t('admin.users.english_users')}: **${stats.englishUsers}**`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: `👥 ${t('admin.users.list_all')}`, callback_data: 'users_list_all_1' },
        { text: `✅ ${t('admin.users.list_active')}`, callback_data: 'users_list_active_1' }
      ],
      [
        { text: `❌ ${t('admin.users.list_banned')}`, callback_data: 'users_list_banned_1' },
        { text: `👑 ${t('admin.users.list_admins')}`, callback_data: 'users_list_admins_1' }
      ],
      [
        { text: `🔍 ${t('admin.users.search')}`, callback_data: 'users_search' },
        { text: `📊 ${t('admin.users.export')}`, callback_data: 'users_export' }
      ],
      [
        { text: `🔄 ${t('common.refresh')}`, callback_data: 'users_refresh' }
      ]
    ]
  };
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function getUserStatistics() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const [
    totalUsers,
    activeUsers,
    bannedUsers,
    adminUsers,
    todayRegistrations,
    weekRegistrations,
    totalReminders,
    activeReminders,
    completedReminders,
    arabicUsers,
    englishUsers
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true, isBanned: false }),
    User.countDocuments({ isBanned: true }),
    User.countDocuments({ isAdmin: true }),
    User.countDocuments({ createdAt: { $gte: todayStart } }),
    User.countDocuments({ createdAt: { $gte: weekStart } }),
    Reminder.countDocuments({}),
    Reminder.countDocuments({ isActive: true, isCompleted: false }),
    Reminder.countDocuments({ isCompleted: true }),
    User.countDocuments({ language: 'ar' }),
    User.countDocuments({ language: 'en' })
  ]);
  
  return {
    totalUsers,
    activeUsers,
    bannedUsers,
    adminUsers,
    todayRegistrations,
    weekRegistrations,
    totalReminders,
    activeReminders,
    completedReminders,
    arabicUsers,
    englishUsers
  };
}

async function handleUsersList(ctx, filter, page = 1) {
  try {
    const t = ctx.t;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    let query = {};
    let title = '';
    
    switch (filter) {
      case 'all':
        query = {};
        title = t('admin.users.all_users');
        break;
      case 'active':
        query = { isActive: true, isBanned: false };
        title = t('admin.users.active_users');
        break;
      case 'banned':
        query = { isBanned: true };
        title = t('admin.users.banned_users');
        break;
      case 'admins':
        query = { isAdmin: true };
        title = t('admin.users.admin_users');
        break;
    }
    
    const [users, totalCount] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);
    
    if (totalCount === 0) {
      await ctx.answerCbQuery(t('admin.users.no_users'));
      return;
    }
    
    let message = `👥 ${title}\n\n`;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const joinDate = moment(user.createdAt).format('YYYY-MM-DD');
      const lastActive = user.lastActive ? moment(user.lastActive).fromNow() : t('admin.users.never');
      
      const status = [];
      if (user.isAdmin) status.push('👑');
      if (user.isBanned) status.push('❌');
      if (!user.isActive) status.push('💤');
      
      message += `${skip + i + 1}. **${user.displayName || user.username || 'Anonymous'}** ${status.join(' ')}\n`;
      message += `   ID: \`${user.telegramId}\`\n`;
      message += `   📅 ${joinDate} | 🔄 ${lastActive}\n`;
      message += `   🔔 ${user.stats.totalReminders} reminders\n\n`;
    }
    
    const totalPages = Math.ceil(totalCount / limit);
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📄 ${t('admin.users.page_info', { current: page, total: totalPages, count: totalCount })}`;
    
    // Create pagination and action buttons
    const buttons = [];
    
    // Pagination buttons
    if (totalPages > 1) {
      const paginationRow = [];
      if (page > 1) {
        paginationRow.push({ text: '⬅️', callback_data: `users_list_${filter}_${page - 1}` });
      }
      paginationRow.push({ text: `${page}/${totalPages}`, callback_data: 'users_noop' });
      if (page < totalPages) {
        paginationRow.push({ text: '➡️', callback_data: `users_list_${filter}_${page + 1}` });
      }
      buttons.push(paginationRow);
    }
    
    // Action buttons
    buttons.push([
      { text: `🔍 ${t('admin.users.user_details')}`, callback_data: 'users_details_prompt' },
      { text: `🔄 ${t('common.refresh')}`, callback_data: `users_list_${filter}_${page}` }
    ]);
    
    buttons.push([
      { text: `⬅️ ${t('common.back')}`, callback_data: 'users_back_to_menu' }
    ]);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    
    await ctx.answerCbQuery();
    
  } catch (error) {
    logger.error('Error handling users list', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function handleUserDetails(ctx, userId) {
  try {
    const t = ctx.t;
    
    const user = await User.findOne({ telegramId: parseInt(userId) });
    if (!user) {
      await ctx.reply(t('admin.users.user_not_found'));
      return;
    }
    
    // Get user's reminder statistics
    const reminderStats = await Reminder.aggregate([
      { $match: { userId: user._id } },
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
    
    const stats = reminderStats[0] || { total: 0, active: 0, completed: 0, overdue: 0 };
    
    const joinDate = moment(user.createdAt).format('YYYY-MM-DD HH:mm');
    const lastActive = user.lastActive ? moment(user.lastActive).format('YYYY-MM-DD HH:mm') : t('admin.users.never');
    
    const status = [];
    if (user.isAdmin) status.push('👑 Admin');
    if (user.isBanned) status.push('❌ Banned');
    if (!user.isActive) status.push('💤 Inactive');
    if (status.length === 0) status.push('✅ Active');
    
    const message = `👤 ${t('admin.users.user_details')}\n\n` +
      `**${user.displayName || user.username || 'Anonymous'}**\n\n` +
      `🆔 **ID**: \`${user.telegramId}\`\n` +
      `👤 **Username**: ${user.username ? `@${user.username}` : t('admin.users.no_username')}\n` +
      `🏷️ **Status**: ${status.join(', ')}\n` +
      `🌍 **Language**: ${user.language === 'ar' ? '🇸🇦 Arabic' : '🇺🇸 English'}\n` +
      `🕐 **Timezone**: ${user.timezone}\n` +
      `📅 **Joined**: ${joinDate}\n` +
      `🔄 **Last Active**: ${lastActive}\n\n` +
      `📊 **Reminder Statistics**:\n` +
      `• Total: **${stats.total}**\n` +
      `• Active: **${stats.active}**\n` +
      `• Completed: **${stats.completed}**\n` +
      `• Overdue: **${stats.overdue}**\n\n` +
      `⚙️ **Settings**:\n` +
      `• Max Reminders: **${user.settings.maxReminders}**\n` +
      `• Notifications: **${user.settings.notifications ? 'Enabled' : 'Disabled'}**`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: user.isBanned ? `✅ ${t('admin.users.unban')}` : `❌ ${t('admin.users.ban')}`, 
            callback_data: `users_toggle_ban_${user.telegramId}` },
          { text: user.isAdmin ? `👤 ${t('admin.users.remove_admin')}` : `👑 ${t('admin.users.make_admin')}`, 
            callback_data: `users_toggle_admin_${user.telegramId}` }
        ],
        [
          { text: `📨 ${t('admin.users.send_message')}`, callback_data: `users_message_${user.telegramId}` },
          { text: `🔔 ${t('admin.users.view_reminders')}`, callback_data: `users_reminders_${user.telegramId}` }
        ],
        [
          { text: `⬅️ ${t('common.back')}`, callback_data: 'users_back_to_menu' }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    logger.adminAction(ctx.user._id, 'user_details_viewed', { targetUserId: user._id });
    
  } catch (error) {
    logger.error('Error showing user details', error);
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = usersHandler;
module.exports.handleUsersList = handleUsersList;
module.exports.handleUserDetails = handleUserDetails;
module.exports.showUserManagement = showUserManagement;