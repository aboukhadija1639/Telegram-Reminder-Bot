const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const { createTagsKeyboard, createTagActionsKeyboard } = require('../../utils/keyboards');

// Tags states
const TAGS_STATES = {
  MAIN: 'main',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete'
};

async function tagsHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Initialize tags session
    ctx.session.tagsData = {
      state: TAGS_STATES.MAIN,
      selectedTag: null,
      action: null
    };
    
    await showTagsMain(ctx, user);
    
    logger.userAction(user._id, 'tags_command_started');
    
  } catch (error) {
    logger.error('Error in tags command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showTagsMain(ctx, user) {
  try {
    const t = ctx.t;
    
    // Get user's tags and counts
    const tags = await Reminder.aggregate([
      { $match: { userId: user._id, isActive: true } },
      { $unwind: '$tags' },
      { $group: { 
        _id: '$tags', 
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isCompleted', 0, 1] } }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Filter out null/undefined tags
    const validTags = tags.filter(tag => tag._id && tag._id.trim() !== '');
    
    let message = `${t('tags.title')}\n\n`;
    
    if (validTags.length === 0) {
      message += `${t('tags.no_tags')}\n\n`;
      message += `${t('tags.create_first')}`;
    } else {
      message += `${t('tags.your_tags')}\n\n`;
      
      validTags.forEach((tag, index) => {
        message += `${index + 1}. **#${tag._id}**\n`;
        message += `   📊 ${t('tags.total_reminders')}: ${tag.count}\n`;
        message += `   ⏳ ${t('tags.active_reminders')}: ${tag.active}\n\n`;
      });
      
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${t('tags.total_tags')}: ${validTags.length}`;
    }
    
    // Create keyboard
    const keyboard = createTagsKeyboard(user.language, validTags.length > 0);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing tags main', error, {
      userId: user._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function handleTagsInput(ctx) {
  try {
    const tagsData = ctx.session.tagsData;
    if (!tagsData) {
      return false; // Not in tags mode
    }
    
    const userInput = ctx.message.text.trim();
    const t = ctx.t;
    const user = ctx.user;
    
    if (!userInput) {
      await ctx.reply(t('tags.empty_input'));
      return true;
    }
    
    switch (tagsData.state) {
      case TAGS_STATES.CREATE:
        return await handleCreateTag(ctx, userInput);
        
      case TAGS_STATES.EDIT:
        return await handleEditTag(ctx, userInput);
        
      default:
        return false;
    }
    
  } catch (error) {
    logger.error('Error handling tags input', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleCreateTag(ctx, tagName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Clean tag name (remove # if present, trim whitespace)
    const cleanTagName = tagName.replace(/^#/, '').trim();
    
    // Validate tag name
    if (cleanTagName.length < 2) {
      await ctx.reply(t('tags.name_too_short'));
      return true;
    }
    
    if (cleanTagName.length > 30) {
      await ctx.reply(t('tags.name_too_long'));
      return true;
    }
    
    // Check if tag already exists
    const existingTag = await Reminder.findOne({
      userId: user._id,
      tags: cleanTagName,
      isActive: true
    });
    
    if (existingTag) {
      await ctx.reply(t('tags.already_exists', { name: cleanTagName }));
      return true;
    }
    
    // Create a sample reminder with this tag to establish it
    const sampleReminder = new Reminder({
      userId: user._id,
      title: t('tags.sample_reminder_title'),
      message: t('tags.sample_reminder_message'),
      scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      tags: [cleanTagName],
      timezone: user.timezone,
      isActive: false, // Don't actually schedule this reminder
      isCompleted: true // Mark as completed so it doesn't interfere
    });
    
    await sampleReminder.save();
    
    // Delete the sample reminder immediately
    await sampleReminder.deleteOne();
    
    await ctx.reply(t('tags.created_successfully', { name: cleanTagName }));
    
    // Reset session and show main view
    delete ctx.session.tagsData;
    await showTagsMain(ctx, user);
    
    logger.userAction(user._id, 'tag_created', { tag: cleanTagName });
    
    return true;
    
  } catch (error) {
    logger.error('Error creating tag', error, {
      userId: user._id,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleEditTag(ctx, newName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const tagsData = ctx.session.tagsData;
    const oldName = tagsData.selectedTag;
    
    // Clean new tag name
    const cleanNewName = newName.replace(/^#/, '').trim();
    
    // Validate new name
    if (cleanNewName.length < 2) {
      await ctx.reply(t('tags.name_too_short'));
      return true;
    }
    
    if (cleanNewName.length > 30) {
      await ctx.reply(t('tags.name_too_long'));
      return true;
    }
    
    // Check if new name already exists
    const existingTag = await Reminder.findOne({
      userId: user._id,
      tags: cleanNewName,
      isActive: true
    });
    
    if (existingTag) {
      await ctx.reply(t('tags.already_exists', { name: cleanNewName }));
      return true;
    }
    
    // Update all reminders with this tag
    const updateResult = await Reminder.updateMany(
      { userId: user._id, tags: oldName },
      { $set: { 'tags.$': cleanNewName } }
    );
    
    if (updateResult.modifiedCount > 0) {
      await ctx.reply(t('tags.renamed_successfully', { 
        oldName, 
        newName: cleanNewName, 
        count: updateResult.modifiedCount 
      }));
      
      logger.userAction(user._id, 'tag_renamed', { 
        oldName, 
        newName: cleanNewName, 
        count: updateResult.modifiedCount 
      });
    } else {
      await ctx.reply(t('tags.rename_failed'));
    }
    
    // Reset session and show main view
    delete ctx.session.tagsData;
    await showTagsMain(ctx, user);
    
    return true;
    
  } catch (error) {
    logger.error('Error editing tag', error, {
      userId: user._id,
      oldName: tagsData.selectedTag,
      newName
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

// Handle tag actions from callback buttons
async function handleTagAction(ctx, action, tagName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    const tagsData = ctx.session.tagsData;
    tagsData.selectedTag = tagName;
    
    switch (action) {
      case 'view':
        await showTagDetails(ctx, user, tagName);
        break;
        
      case 'edit':
        await startEditTag(ctx, user, tagName);
        break;
        
      case 'delete':
        await startDeleteTag(ctx, user, tagName);
        break;
        
      default:
        await ctx.reply(t('errors.not_found'));
    }
    
  } catch (error) {
    logger.error('Error handling tag action', error, {
      userId: user._id,
      action,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showTagDetails(ctx, user, tagName) {
  try {
    const t = ctx.t;
    
    // Get reminders with this tag
    const reminders = await Reminder.find({
      userId: user._id,
      tags: tagName,
      isActive: true
    }).sort({ scheduledTime: 1 }).limit(10);
    
    let message = `${t('tags.details_title')}\n\n`;
    message += `🏷️ **#${tagName}**\n\n`;
    
    if (reminders.length === 0) {
      message += `${t('tags.no_reminders_with_tag')}`;
    } else {
      message += `${t('tags.reminders_with_tag')}:\n\n`;
      
      reminders.forEach((reminder, index) => {
        const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
        message += `${index + 1}. ${status} **${reminder.title}**\n`;
        message += `   📅 ${reminder.scheduledTime.toLocaleDateString(user.language)}\n\n`;
      });
      
      if (reminders.length === 10) {
        message += `${t('tags.more_reminders')}`;
      }
    }
    
    // Create actions keyboard
    const keyboard = createTagActionsKeyboard(user.language, tagName);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing tag details', error, {
      userId: user._id,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function startEditTag(ctx, user, tagName) {
  try {
    const t = ctx.t;
    
    const tagsData = ctx.session.tagsData;
    tagsData.state = TAGS_STATES.EDIT;
    tagsData.action = 'edit';
    
    const message = `${t('tags.edit_title')}\n\n` +
      `${t('tags.current_name')}: **#${tagName}**\n\n` +
      `${t('tags.enter_new_name')}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
    
  } catch (error) {
    logger.error('Error starting edit tag', error, {
      userId: user._id,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function startDeleteTag(ctx, user, tagName) {
  try {
    const t = ctx.t;
    
    // Count reminders with this tag
    const reminderCount = await Reminder.countDocuments({
      userId: user._id,
      tags: tagName,
      isActive: true
    });
    
    const message = `${t('tags.delete_title')}\n\n` +
      `🏷️ **#${tagName}**\n\n` +
      `${t('tags.delete_warning', { count: reminderCount })}\n\n` +
      `${t('tags.delete_confirm')}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: t('common.yes'), callback_data: `tag_delete_confirm_${tagName}` },
          { text: t('common.no'), callback_data: 'tag_delete_cancel' }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error starting delete tag', error, {
      userId: user._id,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle delete confirmation
async function handleDeleteConfirmation(ctx, confirmed, tagName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    if (confirmed === 'confirm') {
      // Remove tag from all reminders
      const updateResult = await Reminder.updateMany(
        { userId: user._id, tags: tagName },
        { $pull: { tags: tagName } }
      );
      
      await ctx.reply(t('tags.deleted_successfully', { 
        name: tagName, 
        count: updateResult.modifiedCount 
      }));
      
      logger.userAction(user._id, 'tag_deleted', { 
        tag: tagName, 
        count: updateResult.modifiedCount 
      });
    } else {
      await ctx.reply(t('tags.delete_cancelled'));
    }
    
    // Reset session and show main view
    delete ctx.session.tagsData;
    await showTagsMain(ctx, user);
    
  } catch (error) {
    logger.error('Error handling delete confirmation', error, {
      userId: user._id,
      tag: tagName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = tagsHandler;
module.exports.handleTagsInput = handleTagsInput;
module.exports.handleTagAction = handleTagAction;
module.exports.handleDeleteConfirmation = handleDeleteConfirmation;
module.exports.TAGS_STATES = TAGS_STATES;