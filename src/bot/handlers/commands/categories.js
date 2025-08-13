const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const { createCategoriesKeyboard, createCategoryActionsKeyboard } = require('../../utils/keyboards');

// Categories states
const CATEGORIES_STATES = {
  MAIN: 'main',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete'
};

async function categoriesHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Initialize categories session
    ctx.session.categoriesData = {
      state: CATEGORIES_STATES.MAIN,
      selectedCategory: null,
      action: null
    };
    
    await showCategoriesMain(ctx, user);
    
    logger.userAction(user._id, 'categories_command_started');
    
  } catch (error) {
    logger.error('Error in categories command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showCategoriesMain(ctx, user) {
  try {
    const t = ctx.t;
    
    // Get user's categories and counts
    const categories = await Reminder.aggregate([
      { $match: { userId: user._id, isActive: true } },
      { $group: { 
        _id: '$category', 
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isCompleted', 0, 1] } }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Filter out null/undefined categories
    const validCategories = categories.filter(cat => cat._id && cat._id.trim() !== '');
    
    let message = `${t('categories.title')}\n\n`;
    
    if (validCategories.length === 0) {
      message += `${t('categories.no_categories')}\n\n`;
      message += `${t('categories.create_first')}`;
    } else {
      message += `${t('categories.your_categories')}\n\n`;
      
      validCategories.forEach((cat, index) => {
        message += `${index + 1}. **${cat._id}**\n`;
        message += `   📊 ${t('categories.total_reminders')}: ${cat.count}\n`;
        message += `   ⏳ ${t('categories.active_reminders')}: ${cat.active}\n\n`;
      });
      
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${t('categories.total_categories')}: ${validCategories.length}`;
    }
    
    // Create keyboard
    const keyboard = createCategoriesKeyboard(user.language, validCategories.length > 0);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing categories main', error, {
      userId: user._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function handleCategoriesInput(ctx) {
  try {
    const categoriesData = ctx.session.categoriesData;
    if (!categoriesData) {
      return false; // Not in categories mode
    }
    
    const userInput = ctx.message.text.trim();
    const t = ctx.t;
    const user = ctx.user;
    
    if (!userInput) {
      await ctx.reply(t('categories.empty_input'));
      return true;
    }
    
    switch (categoriesData.state) {
      case CATEGORIES_STATES.CREATE:
        return await handleCreateCategory(ctx, userInput);
        
      case CATEGORIES_STATES.EDIT:
        return await handleEditCategory(ctx, userInput);
        
      default:
        return false;
    }
    
  } catch (error) {
    logger.error('Error handling categories input', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleCreateCategory(ctx, categoryName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Validate category name
    if (categoryName.length < 2) {
      await ctx.reply(t('categories.name_too_short'));
      return true;
    }
    
    if (categoryName.length > 50) {
      await ctx.reply(t('categories.name_too_long'));
      return true;
    }
    
    // Check if category already exists
    const existingCategory = await Reminder.findOne({
      userId: user._id,
      category: categoryName,
      isActive: true
    });
    
    if (existingCategory) {
      await ctx.reply(t('categories.already_exists', { name: categoryName }));
      return true;
    }
    
    // Create a sample reminder with this category to establish it
    const sampleReminder = new Reminder({
      userId: user._id,
      title: t('categories.sample_reminder_title'),
      message: t('categories.sample_reminder_message'),
      scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      category: categoryName,
      timezone: user.timezone,
      isActive: false, // Don't actually schedule this reminder
      isCompleted: true // Mark as completed so it doesn't interfere
    });
    
    await sampleReminder.save();
    
    // Delete the sample reminder immediately
    await sampleReminder.deleteOne();
    
    await ctx.reply(t('categories.created_successfully', { name: categoryName }));
    
    // Reset session and show main view
    delete ctx.session.categoriesData;
    await showCategoriesMain(ctx, user);
    
    logger.userAction(user._id, 'category_created', { category: categoryName });
    
    return true;
    
  } catch (error) {
    logger.error('Error creating category', error, {
      userId: user._id,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleEditCategory(ctx, newName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    const categoriesData = ctx.session.categoriesData;
    const oldName = categoriesData.selectedCategory;
    
    // Validate new name
    if (newName.length < 2) {
      await ctx.reply(t('categories.name_too_short'));
      return true;
    }
    
    if (newName.length > 50) {
      await ctx.reply(t('categories.name_too_long'));
      return true;
    }
    
    // Check if new name already exists
    const existingCategory = await Reminder.findOne({
      userId: user._id,
      category: newName,
      isActive: true,
      _id: { $ne: categoriesData.selectedReminderId }
    });
    
    if (existingCategory) {
      await ctx.reply(t('categories.already_exists', { name: newName }));
      return true;
    }
    
    // Update all reminders with this category
    const updateResult = await Reminder.updateMany(
      { userId: user._id, category: oldName },
      { $set: { category: newName } }
    );
    
    if (updateResult.modifiedCount > 0) {
      await ctx.reply(t('categories.renamed_successfully', { 
        oldName, 
        newName, 
        count: updateResult.modifiedCount 
      }));
      
      logger.userAction(user._id, 'category_renamed', { 
        oldName, 
        newName, 
        count: updateResult.modifiedCount 
      });
    } else {
      await ctx.reply(t('categories.rename_failed'));
    }
    
    // Reset session and show main view
    delete ctx.session.categoriesData;
    await showCategoriesMain(ctx, user);
    
    return true;
    
  } catch (error) {
    logger.error('Error editing category', error, {
      userId: user._id,
      oldName: categoriesData.selectedCategory,
      newName
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

// Handle category actions from callback buttons
async function handleCategoryAction(ctx, action, categoryName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    const categoriesData = ctx.session.categoriesData;
    categoriesData.selectedCategory = categoryName;
    
    switch (action) {
      case 'view':
        await showCategoryDetails(ctx, user, categoryName);
        break;
        
      case 'edit':
        await startEditCategory(ctx, user, categoryName);
        break;
        
      case 'delete':
        await startDeleteCategory(ctx, user, categoryName);
        break;
        
      default:
        await ctx.reply(t('errors.not_found'));
    }
    
  } catch (error) {
    logger.error('Error handling category action', error, {
      userId: user._id,
      action,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function showCategoryDetails(ctx, user, categoryName) {
  try {
    const t = ctx.t;
    
    // Get reminders in this category
    const reminders = await Reminder.find({
      userId: user._id,
      category: categoryName,
      isActive: true
    }).sort({ scheduledTime: 1 }).limit(10);
    
    let message = `${t('categories.details_title')}\n\n`;
    message += `🏷️ **${categoryName}**\n\n`;
    
    if (reminders.length === 0) {
      message += `${t('categories.no_reminders_in_category')}`;
    } else {
      message += `${t('categories.reminders_in_category')}:\n\n`;
      
      reminders.forEach((reminder, index) => {
        const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
        message += `${index + 1}. ${status} **${reminder.title}**\n`;
        message += `   📅 ${reminder.scheduledTime.toLocaleDateString(user.language)}\n\n`;
      });
      
      if (reminders.length === 10) {
        message += `${t('categories.more_reminders')}`;
      }
    }
    
    // Create actions keyboard
    const keyboard = createCategoryActionsKeyboard(user.language, categoryName);
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error showing category details', error, {
      userId: user._id,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function startEditCategory(ctx, user, categoryName) {
  try {
    const t = ctx.t;
    
    const categoriesData = ctx.session.categoriesData;
    categoriesData.state = CATEGORIES_STATES.EDIT;
    categoriesData.action = 'edit';
    
    const message = `${t('categories.edit_title')}\n\n` +
      `${t('categories.current_name')}: **${categoryName}**\n\n` +
      `${t('categories.enter_new_name')}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
    
  } catch (error) {
    logger.error('Error starting edit category', error, {
      userId: user._id,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function startDeleteCategory(ctx, user, categoryName) {
  try {
    const t = ctx.t;
    
    // Count reminders in this category
    const reminderCount = await Reminder.countDocuments({
      userId: user._id,
      category: categoryName,
      isActive: true
    });
    
    const message = `${t('categories.delete_title')}\n\n` +
      `🏷️ **${categoryName}**\n\n` +
      `${t('categories.delete_warning', { count: reminderCount })}\n\n` +
      `${t('categories.delete_confirm')}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: t('common.yes'), callback_data: `category_delete_confirm_${categoryName}` },
          { text: t('common.no'), callback_data: 'category_delete_cancel' }
        ]
      ]
    };
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error starting delete category', error, {
      userId: user._id,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle delete confirmation
async function handleDeleteConfirmation(ctx, confirmed, categoryName) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    if (confirmed === 'confirm') {
      // Remove category from all reminders
      const updateResult = await Reminder.updateMany(
        { userId: user._id, category: categoryName },
        { $unset: { category: 1 } }
      );
      
      await ctx.reply(t('categories.deleted_successfully', { 
        name: categoryName, 
        count: updateResult.modifiedCount 
      }));
      
      logger.userAction(user._id, 'category_deleted', { 
        category: categoryName, 
        count: updateResult.modifiedCount 
      });
    } else {
      await ctx.reply(t('categories.delete_cancelled'));
    }
    
    // Reset session and show main view
    delete ctx.session.categoriesData;
    await showCategoriesMain(ctx, user);
    
  } catch (error) {
    logger.error('Error handling delete confirmation', error, {
      userId: user._id,
      category: categoryName
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = categoriesHandler;
module.exports.handleCategoriesInput = handleCategoriesInput;
module.exports.handleCategoryAction = handleCategoryAction;
module.exports.handleDeleteConfirmation = handleDeleteConfirmation;
module.exports.CATEGORIES_STATES = CATEGORIES_STATES;