const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');

const i18nConfig = {
  lng: process.env.DEFAULT_LANGUAGE || 'ar',
  fallbackLng: 'en',
  debug: process.env.NODE_ENV === 'development',
  
  // Load translation files
  backend: {
    loadPath: path.join(__dirname, '../../locales/{{lng}}/translation.json'),
    jsonIndent: 2
  },
  
  // Interpolation options
  interpolation: {
    escapeValue: false, // Not needed for Telegram
    formatSeparator: ',',
    format: (value, format, lng) => {
      if (format === 'uppercase') return value.toUpperCase();
      if (format === 'lowercase') return value.toLowerCase();
      if (format === 'date') return new Date(value).toLocaleDateString(lng === 'ar' ? 'ar-SA' : 'en-US');
      if (format === 'time') return new Date(value).toLocaleTimeString(lng === 'ar' ? 'ar-SA' : 'en-US');
      return value;
    }
  },
  
  // Cache settings
  cache: {
    enabled: true,
    prefix: 'i18next_res_',
    expirationTime: 7 * 24 * 60 * 60 * 1000 // 7 days
  },
  
  // Detection options
  detection: {
    order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator'],
    caches: ['localStorage', 'cookie']
  }
};

// Initialize i18next
i18next
  .use(Backend)
  .init(i18nConfig, (err, t) => {
    if (err) {
      console.error('i18next initialization error:', err);
    } else {
      console.log('✅ i18next initialized successfully');
    }
  });

/**
 * Get translation function for specific language
 * @param {string} language - Language code ('ar' or 'en')
 * @returns {function} Translation function
 */
function getTranslator(language = 'ar') {
  return i18next.getFixedT(language);
}

/**
 * Translate text with interpolation
 * @param {string} language - Language code
 * @param {string} key - Translation key
 * @param {object} options - Interpolation options
 * @returns {string} Translated text
 */
function translate(language, key, options = {}) {
  try {
    const t = getTranslator(language);
    return t(key, options);
  } catch (error) {
    console.error(`Translation error for key "${key}" in language "${language}":`, error);
    // Fallback to English if Arabic fails
    if (language !== 'en') {
      try {
        const tEn = getTranslator('en');
        return tEn(key, options);
      } catch (fallbackError) {
        console.error(`Fallback translation error for key "${key}":`, fallbackError);
        return key; // Return key if all else fails
      }
    }
    return key;
  }
}

/**
 * Get language-specific formatting options
 * @param {string} language - Language code
 * @returns {object} Formatting options
 */
function getFormatOptions(language) {
  const options = {
    ar: {
      direction: 'rtl',
      locale: 'ar-SA',
      currency: 'SAR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: 'HH:mm',
      weekStart: 6, // Saturday
      numbers: {
        decimal: '.',
        thousands: ','
      }
    },
    en: {
      direction: 'ltr',
      locale: 'en-US',
      currency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: 'hh:mm A',
      weekStart: 0, // Sunday
      numbers: {
        decimal: '.',
        thousands: ','
      }
    }
  };
  
  return options[language] || options.en;
}

/**
 * Format date according to user's language
 * @param {Date|string} date - Date to format
 * @param {string} language - Language code
 * @returns {string} Formatted date
 */
function formatDate(date, language = 'ar') {
  try {
    const dateObj = new Date(date);
    const options = getFormatOptions(language);
    
    return dateObj.toLocaleDateString(options.locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return date.toString();
  }
}

/**
 * Format time according to user's language
 * @param {Date|string} time - Time to format
 * @param {string} language - Language code
 * @returns {string} Formatted time
 */
function formatTime(time, language = 'ar') {
  try {
    const timeObj = new Date(time);
    const options = getFormatOptions(language);
    
    if (language === 'ar') {
      return timeObj.toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } else {
      return timeObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  } catch (error) {
    console.error('Time formatting error:', error);
    return time.toString();
  }
}

/**
 * Format number according to user's language
 * @param {number} number - Number to format
 * @param {string} language - Language code
 * @returns {string} Formatted number
 */
function formatNumber(number, language = 'ar') {
  try {
    const options = getFormatOptions(language);
    return new Intl.NumberFormat(options.locale).format(number);
  } catch (error) {
    console.error('Number formatting error:', error);
    return number.toString();
  }
}

/**
 * Get available languages
 * @returns {Array} Array of language objects
 */
function getAvailableLanguages() {
  return [
    { code: 'ar', name: 'العربية', flag: '🇸🇦', direction: 'rtl' },
    { code: 'en', name: 'English', flag: '🇺🇸', direction: 'ltr' }
  ];
}

/**
 * Check if language is RTL
 * @param {string} language - Language code
 * @returns {boolean} True if RTL
 */
function isRTL(language) {
  return language === 'ar';
}

/**
 * Get language display name
 * @param {string} language - Language code
 * @returns {string} Display name
 */
function getLanguageDisplayName(language) {
  const languages = {
    ar: 'العربية',
    en: 'English'
  };
  return languages[language] || language;
}

/**
 * Sanitize text for Telegram
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (!text) return '';
  
  // Remove or escape potentially harmful characters
  return text
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/`/g, '\\`') // Escape backticks
    .replace(/\*/g, '\\*') // Escape asterisks
    .replace(/_/g, '\\_') // Escape underscores
    .trim();
}

module.exports = {
  i18next,
  translate,
  getTranslator,
  getFormatOptions,
  formatDate,
  formatTime,
  formatNumber,
  getAvailableLanguages,
  isRTL,
  getLanguageDisplayName,
  sanitizeText
};