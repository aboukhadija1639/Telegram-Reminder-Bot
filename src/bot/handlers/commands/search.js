const logger = require('../../../utils/logger');
const Reminder = require('../../../database/models/Reminder');
const { createSearchResultsKeyboard } = require('../../utils/keyboards');
const { formatDate, formatTime } = require('../../../config/i18n');

// Search states
const SEARCH_STATES = {
  QUERY: 'query',
  FILTER: 'filter',
  RESULTS: 'results'
};

async function searchHandler(ctx) {
  try {
    const user = ctx.user;
    const t = ctx.t;
    
    // Initialize search session
    ctx.session.searchData = {
      state: SEARCH_STATES.QUERY,
      query: null,
      filter: 'all', // all, title, category, tags
      results: [],
      currentPage: 1
    };
    
    const message = `${t('search.title')}\n\n` +
      `${t('search.instructions')}\n\n` +
      `${t('search.examples')}\n\n` +
      `${t('search.enter_query')}`;
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
    
    logger.userAction(user._id, 'search_command_started');
    
  } catch (error) {
    logger.error('Error in search command', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function handleSearchInput(ctx) {
  try {
    const searchData = ctx.session.searchData;
    if (!searchData) {
      return false; // Not in search mode
    }
    
    const userInput = ctx.message.text.trim();
    const t = ctx.t;
    const user = ctx.user;
    
    if (!userInput) {
      await ctx.reply(t('search.empty_query'));
      return true;
    }
    
    switch (searchData.state) {
      case SEARCH_STATES.QUERY:
        return await handleQueryInput(ctx, userInput);
        
      case SEARCH_STATES.FILTER:
        return await handleFilterInput(ctx, userInput);
        
      default:
        return false;
    }
    
  } catch (error) {
    logger.error('Error handling search input', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
    return true;
  }
}

async function handleQueryInput(ctx, query) {
  const searchData = ctx.session.searchData;
  const t = ctx.t;
  const user = ctx.user;
  
  searchData.query = query;
  
  // Show filter options
  const filterMessage = `${t('search.query_received')}: "${query}"\n\n` +
    `${t('search.choose_filter')}\n\n` +
    `🔍 ${t('search.filter_all')}\n` +
    `📝 ${t('search.filter_title')}\n` +
    `🏷️ ${t('search.filter_category')}\n` +
    `🏷️ ${t('search.filter_tags')}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: t('search.filter_all'), callback_data: 'search_filter_all' },
        { text: t('search.filter_title'), callback_data: 'search_filter_title' }
      ],
      [
        { text: t('search.filter_category'), callback_data: 'search_filter_category' },
        { text: t('search.filter_tags'), callback_data: 'search_filter_tags' }
      ]
    ]
  };
  
  await ctx.reply(filterMessage, { reply_markup: keyboard });
  searchData.state = SEARCH_STATES.FILTER;
  
  return true;
}

async function handleFilterInput(ctx, filter) {
  const searchData = ctx.session.searchData;
  const t = ctx.t;
  const user = ctx.user;
  
  // Map filter input to filter type
  const filterMap = {
    'all': 'all',
    'title': 'title',
    'category': 'category',
    'tags': 'tags'
  };
  
  const filterType = filterMap[filter.toLowerCase()] || 'all';
  searchData.filter = filterType;
  
  // Perform search
  await performSearch(ctx, user, searchData);
  
  return true;
}

async function performSearch(ctx, user, searchData) {
  try {
    const t = ctx.t;
    const { query, filter } = searchData;
    
    let searchCriteria = {
      userId: user._id,
      isActive: true,
      isCompleted: false
    };
    
    // Build search criteria based on filter
    switch (filter) {
      case 'title':
        searchCriteria.title = { $regex: query, $options: 'i' };
        break;
      case 'category':
        searchCriteria.category = { $regex: query, $options: 'i' };
        break;
      case 'tags':
        searchCriteria.tags = { $in: [new RegExp(query, 'i')] };
        break;
      case 'all':
      default:
        searchCriteria.$or = [
          { title: { $regex: query, $options: 'i' } },
          { message: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
          { tags: { $in: [new RegExp(query, 'i')] } }
        ];
        break;
    }
    
    // Execute search
    const results = await Reminder.find(searchCriteria)
      .sort({ scheduledTime: 1 })
      .limit(50); // Limit results for performance
    
    searchData.results = results;
    searchData.currentPage = 1;
    
    if (results.length === 0) {
      await ctx.reply(t('search.no_results', { query, filter: t(`search.filter_${filter}`) }));
      delete ctx.session.searchData;
      return;
    }
    
    // Display results
    await displaySearchResults(ctx, user, searchData);
    
  } catch (error) {
    logger.error('Error performing search', error, {
      userId: user._id,
      query: searchData.query,
      filter: searchData.filter
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

async function displaySearchResults(ctx, user, searchData) {
  try {
    const t = ctx.t;
    const { query, filter, results, currentPage } = searchData;
    
    const limit = 5;
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;
    const pageResults = results.slice(startIndex, endIndex);
    const totalPages = Math.ceil(results.length / limit);
    
    let message = `${t('search.results_title')}\n\n`;
    message += `${t('search.query_info', { query, filter: t(`search.filter_${filter}`) })}\n`;
    message += `${t('search.results_count', { count: results.length })}\n\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    pageResults.forEach((reminder, index) => {
      const globalIndex = startIndex + index + 1;
      const status = reminder.isOverdue ? t('list.overdue') : t('list.upcoming');
      const recurrence = reminder.isRecurring 
        ? ` (${t(`reminder.recurring_${reminder.recurringPattern}`)})`
        : '';
      
      message += `${globalIndex}. ${status} **${reminder.title}**\n`;
      message += `   📅 ${formatDate(reminder.scheduledTime, user.language)} `;
      message += `⏰ ${formatTime(reminder.scheduledTime, user.language)}`;
      message += `${recurrence}\n\n`;
    });
    
    // Add pagination info
    if (totalPages > 1) {
      message += `━━━━━━━━━━━━━━━━━━━━\n`;
      message += `${t('search.page_info', { current: currentPage, total: totalPages })}`;
    }
    
    // Create keyboard for results
    const keyboard = createSearchResultsKeyboard(
      pageResults, 
      currentPage, 
      totalPages, 
      user.language
    );
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    searchData.state = SEARCH_STATES.RESULTS;
    
  } catch (error) {
    logger.error('Error displaying search results', error, {
      userId: user._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

// Handle search pagination
async function handleSearchPagination(ctx, page) {
  try {
    const user = ctx.user;
    const searchData = ctx.session.searchData;
    
    if (!searchData || searchData.state !== SEARCH_STATES.RESULTS) {
      return;
    }
    
    searchData.currentPage = parseInt(page);
    await displaySearchResults(ctx, user, searchData);
    
    // Edit the message instead of sending a new one
    await ctx.deleteMessage();
    
    logger.userAction(user._id, 'search_pagination', { page });
    
  } catch (error) {
    logger.error('Error handling search pagination', error, {
      userId: ctx.user?._id
    });
    
    await ctx.reply(ctx.t('errors.general'));
  }
}

module.exports = searchHandler;
module.exports.handleSearchInput = handleSearchInput;
module.exports.handleSearchPagination = handleSearchPagination;
module.exports.SEARCH_STATES = SEARCH_STATES;