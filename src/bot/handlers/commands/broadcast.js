const logger = require('../../../utils/logger');
const User = require('../../../database/models/User');
const { createConfirmationKeyboard } = require('../../utils/keyboards');

// Broadcast states
const BROADCAST_STATES = {
  MESSAGE: 'message',
  CONFIRMATION: 'confirmation',
  SENDING: 'sending'
};

async function broadcastHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Initialize broadcast session
    ctx.session.broadcastData = {
      state: BROADCAST_STATES.MESSAGE,
      message: null,
      messageId: null
    };
    
    const message = `${t('admin.broadcast.title')}\n\n` +
      `${t('admin.broadcast.instructions')}\n\n` +
      `${t('admin.broadcast.supported_formats')}\n` +
      `• ${t('admin.broadcast.text')}\n` +
      `• ${t('admin.broadcast.markdown')}\n` +
      `• ${t('admin.broadcast.emojis')}\n\n` +
      `${t('admin.broadcast.enter_message')}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
    
    logger.adminAction(user._id, 'broadcast_started');
    
  } catch (error) {
    logger.error('Error in broadcast command', error, {
      userId: ctx.user?._id
    });
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function handleBroadcastInput(ctx) {
  try {
    const broadcastData = ctx.session.broadcastData;
    if (!broadcastData || broadcastData.state !== BROADCAST_STATES.MESSAGE) {
      return false; // Not in broadcast mode
    }
    
    const message = ctx.message.text || ctx.message.caption;
    if (!message || message.trim().length === 0) {
      await ctx.reply(ctx.t('admin.broadcast.empty_message'));
      return true;
    }
    
    if (message.length > 4000) {
      await ctx.reply(ctx.t('admin.broadcast.message_too_long'));
      return true;
    }
    
    // Store message data
    broadcastData.message = message;
    broadcastData.messageId = ctx.message.message_id;
    broadcastData.state = BROADCAST_STATES.CONFIRMATION;
    
    await showBroadcastConfirmation(ctx);
    
    logger.adminAction(ctx.user._id, 'broadcast_message_entered', {
      messageLength: message.length
    });
    
    return true;
    
  } catch (error) {
    logger.error('Error handling broadcast input', error);
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function showBroadcastConfirmation(ctx) {
  const t = ctx.t;
  const broadcastData = ctx.session.broadcastData;
  
  // Get user count
  const userCount = await User.countDocuments({
    isActive: true,
    isBanned: false
  });
  
  const message = `${t('admin.broadcast.confirm_title')}\n\n` +
    `${t('admin.broadcast.message_preview')}:\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${broadcastData.message}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 ${t('admin.broadcast.recipient_count', { count: userCount })}\n\n` +
    `⚠️ ${t('admin.broadcast.warning')}\n\n` +
    `${t('admin.broadcast.confirm_question')}`;
  
  const keyboard = createConfirmationKeyboard(
    ctx.user.language, 
    'broadcast_confirm', 
    'broadcast_cancel'
  );
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    ...keyboard
  });
}

async function handleBroadcastConfirmation(ctx, action) {
  try {
    const t = ctx.t;
    const broadcastData = ctx.session.broadcastData;
    const user = ctx.user;
    
    if (!broadcastData || broadcastData.state !== BROADCAST_STATES.CONFIRMATION) {
      await ctx.answerCbQuery(t('errors.session_expired'));
      return;
    }
    
    if (action === 'cancel') {
      delete ctx.session.broadcastData;
      await ctx.editMessageText(t('admin.broadcast.cancelled'));
      await ctx.answerCbQuery(t('common.cancelled'));
      
      logger.adminAction(user._id, 'broadcast_cancelled');
      return;
    }
    
    if (action === 'confirm') {
      broadcastData.state = BROADCAST_STATES.SENDING;
      
      await ctx.editMessageText(t('admin.broadcast.sending_started'));
      await ctx.answerCbQuery(t('admin.broadcast.sending'));
      
      // Start broadcast process
      await executeBroadcast(ctx, broadcastData);
    }
    
  } catch (error) {
    logger.error('Error handling broadcast confirmation', error);
    await ctx.answerCbQuery(ctx.t('errors.general'));
  }
}

async function executeBroadcast(ctx, broadcastData) {
  try {
    const t = ctx.t;
    const user = ctx.user;
    
    // Get all active users
    const users = await User.find({
      isActive: true,
      isBanned: false
    }).select('telegramId language');
    
    if (users.length === 0) {
      await ctx.reply(t('admin.broadcast.no_users'));
      delete ctx.session.broadcastData;
      return;
    }
    
    let sentCount = 0;
    let failedCount = 0;
    const totalUsers = users.length;
    
    // Send progress update
    const progressMessage = await ctx.reply(
      t('admin.broadcast.progress', { 
        sent: sentCount, 
        total: totalUsers, 
        failed: failedCount 
      })
    );
    
    // Send messages in batches to avoid rate limits
    const batchSize = 20;
    const delay = 1000; // 1 second between batches
    
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      // Send to batch concurrently
      const results = await Promise.allSettled(
        batch.map(targetUser => sendBroadcastMessage(ctx, targetUser, broadcastData.message))
      );
      
      // Count results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          sentCount++;
        } else {
          failedCount++;
        }
      });
      
      // Update progress
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progressMessage.message_id,
        null,
        t('admin.broadcast.progress', { 
          sent: sentCount, 
          total: totalUsers, 
          failed: failedCount 
        })
      );
      
      // Delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Final summary
    const summaryMessage = `✅ ${t('admin.broadcast.completed')}\n\n` +
      `📊 ${t('admin.broadcast.summary')}:\n` +
      `• ${t('admin.broadcast.sent_count', { count: sentCount })}\n` +
      `• ${t('admin.broadcast.failed_count', { count: failedCount })}\n` +
      `• ${t('admin.broadcast.success_rate', { 
        rate: totalUsers > 0 ? Math.round((sentCount / totalUsers) * 100) : 0 
      })}`;
    
    await ctx.reply(summaryMessage);
    
    // Clear session
    delete ctx.session.broadcastData;
    
    logger.adminAction(user._id, 'broadcast_completed', {
      totalUsers,
      sentCount,
      failedCount,
      successRate: totalUsers > 0 ? (sentCount / totalUsers) * 100 : 0
    });
    
  } catch (error) {
    logger.error('Error executing broadcast', error);
    await ctx.reply(ctx.t('admin.broadcast.error'));
    delete ctx.session.broadcastData;
  }
}

async function sendBroadcastMessage(ctx, targetUser, message) {
  try {
    await ctx.telegram.sendMessage(
      targetUser.telegramId,
      message,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }
    );
    return true;
  } catch (error) {
    // Log failed sends but don't throw
    logger.warn('Failed to send broadcast message', {
      targetUserId: targetUser._id,
      telegramId: targetUser.telegramId,
      error: error.message
    });
    
    // If user blocked bot or deleted account, mark as inactive
    if (error.code === 403 || error.code === 400) {
      try {
        await User.findByIdAndUpdate(targetUser._id, {
          isActive: false,
          lastActive: new Date()
        });
      } catch (updateError) {
        logger.error('Failed to update user status', updateError);
      }
    }
    
    return false;
  }
}

module.exports = broadcastHandler;
module.exports.handleBroadcastInput = handleBroadcastInput;
module.exports.handleBroadcastConfirmation = handleBroadcastConfirmation;
module.exports.BROADCAST_STATES = BROADCAST_STATES;