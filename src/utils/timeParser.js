const moment = require('moment-timezone');
const logger = require('./logger');

class TimeParser {
  constructor() {
    this.patterns = {
      // Absolute time patterns
      dateTime: {
        en: [
          // 2024-12-20 15:30
          /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
          // 20/12/2024 3:30pm
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?$/i,
          // Dec 20, 2024 at 3:30 PM
          /^(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
          // Tomorrow at 9am
          /^(tomorrow|today)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?$/i,
          // Monday at 2pm
          /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?$/i,
          // Next Friday at 5:30pm
          /^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)?$/i
        ],
        ar: [
          // ٢٠٢٤-١٢-٢٠ ١٥:٣٠
          /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
          // غداً في ٩ صباحاً
          /^(غداً|اليوم)\s+(في|الساعة)\s+(\d{1,2})(:\d{2})?\s*(صباحاً|مساءً)?$/,
          // يوم الاثنين في ٢ مساءً
          /^يوم\s+(الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد)\s+(في|الساعة)\s+(\d{1,2})(:\d{2})?\s*(صباحاً|مساءً)?$/,
          // الجمعة القادمة في ٥:٣٠ مساءً
          /^(الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد)\s+القادم[ةه]?\s+(في|الساعة)\s+(\d{1,2})(:\d{2})?\s*(صباحاً|مساءً)?$/
        ]
      },
      
      // Relative time patterns
      relative: {
        en: [
          // in 30 minutes, in 2 hours, in 3 days
          /^in\s+(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)$/i,
          // after 1 hour, after 30 minutes
          /^after\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/i,
          // 30 min, 2h, 3d
          /^(\d+)\s*(min|minutes|h|hour|hours|d|day|days|w|week|weeks|m|month|months)$/i
        ],
        ar: [
          // بعد ٣٠ دقيقة، بعد ساعتين، بعد ٣ أيام
          /^بعد\s+(\d+)\s+(دقيقة|دقائق|ساعة|ساعات|يوم|أيام|أسبوع|أسابيع|شهر|أشهر)$/,
          // خلال ساعة، خلال يومين
          /^خلال\s+(\d+)\s+(دقيقة|دقائق|ساعة|ساعات|يوم|أيام|أسبوع|أسابيع)$/,
          // ٣٠ د، ٢ س، ٣ ي
          /^(\d+)\s*(د|دقيقة|س|ساعة|ي|يوم|أ|أسبوع|ش|شهر)$/
        ]
      }
    };
    
    this.dayNames = {
      en: {
        monday: 1, tuesday: 2, wednesday: 3, thursday: 4, 
        friday: 5, saturday: 6, sunday: 0
      },
      ar: {
        'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4,
        'الجمعة': 5, 'السبت': 6, 'الأحد': 0
      }
    };
    
    this.monthNames = {
      en: {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
        jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      },
      ar: {
        'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5,
        'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11
      }
    };
  }

  /**
   * Parse natural language time input
   * @param {string} input - Time input string
   * @param {string} language - User language (ar/en)
   * @param {string} timezone - User timezone
   * @returns {Object} Parsed time result
   */
  parseTime(input, language = 'en', timezone = 'UTC') {
    try {
      if (!input || typeof input !== 'string') {
        return { success: false, error: 'Invalid input' };
      }

      const cleanInput = input.trim().toLowerCase();
      
      // Try parsing as absolute time first
      const absoluteResult = this.parseAbsoluteTime(cleanInput, language, timezone);
      if (absoluteResult.success) {
        return absoluteResult;
      }
      
      // Try parsing as relative time
      const relativeResult = this.parseRelativeTime(cleanInput, language, timezone);
      if (relativeResult.success) {
        return relativeResult;
      }
      
      // Try parsing common formats
      const commonResult = this.parseCommonFormats(cleanInput, language, timezone);
      if (commonResult.success) {
        return commonResult;
      }
      
      return { 
        success: false, 
        error: language === 'ar' ? 'تنسيق الوقت غير مفهوم' : 'Time format not understood' 
      };
      
    } catch (error) {
      logger.error('Error parsing time', error, { input, language, timezone });
      return { 
        success: false, 
        error: language === 'ar' ? 'خطأ في تحليل الوقت' : 'Error parsing time' 
      };
    }
  }

  /**
   * Parse absolute time expressions
   */
  parseAbsoluteTime(input, language, timezone) {
    const patterns = this.patterns.dateTime[language] || [];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const result = this.processAbsoluteMatch(match, language, timezone);
        if (result.success) {
          return result;
        }
      }
    }
    
    return { success: false };
  }

  /**
   * Parse relative time expressions
   */
  parseRelativeTime(input, language, timezone) {
    const patterns = this.patterns.relative[language] || [];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        const result = this.processRelativeMatch(match, language, timezone);
        if (result.success) {
          return result;
        }
      }
    }
    
    return { success: false };
  }

  /**
   * Parse common time formats
   */
  parseCommonFormats(input, language, timezone) {
    const now = moment.tz(timezone);
    
    // Handle special keywords
    const keywords = {
      en: {
        'now': now.clone(),
        'tomorrow': now.clone().add(1, 'day').hour(9).minute(0),
        'today': now.clone().hour(18).minute(0),
        'tonight': now.clone().hour(20).minute(0),
        'morning': now.clone().add(1, 'day').hour(8).minute(0),
        'afternoon': now.clone().add(1, 'day').hour(14).minute(0),
        'evening': now.clone().add(1, 'day').hour(18).minute(0)
      },
      ar: {
        'الآن': now.clone(),
        'غداً': now.clone().add(1, 'day').hour(9).minute(0),
        'اليوم': now.clone().hour(18).minute(0),
        'الليلة': now.clone().hour(20).minute(0),
        'صباحاً': now.clone().add(1, 'day').hour(8).minute(0),
        'بعد الظهر': now.clone().add(1, 'day').hour(14).minute(0),
        'مساءً': now.clone().add(1, 'day').hour(18).minute(0)
      }
    };
    
    const keywordMap = keywords[language] || {};
    if (keywordMap[input]) {
      const targetTime = keywordMap[input];
      return {
        success: true,
        dateTime: targetTime.toDate(),
        formatted: targetTime.format('YYYY-MM-DD HH:mm'),
        relative: targetTime.fromNow()
      };
    }
    
    return { success: false };
  }

  /**
   * Process absolute time match
   */
  processAbsoluteMatch(match, language, timezone) {
    try {
      const now = moment.tz(timezone);
      let targetTime = now.clone();
      
      if (language === 'en') {
        // Handle different English patterns
        if (match[0].includes('tomorrow')) {
          targetTime = now.clone().add(1, 'day');
          const hour = parseInt(match[2]);
          const ampm = match[4];
          targetTime.hour(this.convertTo24Hour(hour, ampm)).minute(0);
        } else if (match[0].includes('today')) {
          const hour = parseInt(match[2]);
          const ampm = match[4];
          targetTime.hour(this.convertTo24Hour(hour, ampm)).minute(0);
        } else if (this.dayNames.en[match[1]]) {
          // Day of week
          const dayOfWeek = this.dayNames.en[match[1]];
          const isNext = match[0].includes('next');
          targetTime = this.getNextDayOfWeek(now, dayOfWeek, isNext);
          
          const hour = parseInt(match[2]);
          const ampm = match[4];
          targetTime.hour(this.convertTo24Hour(hour, ampm)).minute(0);
        }
      } else if (language === 'ar') {
        // Handle Arabic patterns
        if (match[1] === 'غداً') {
          targetTime = now.clone().add(1, 'day');
          const hour = parseInt(match[3]);
          const ampm = match[5];
          targetTime.hour(this.convertTo24HourAr(hour, ampm)).minute(0);
        } else if (match[1] === 'اليوم') {
          const hour = parseInt(match[3]);
          const ampm = match[5];
          targetTime.hour(this.convertTo24HourAr(hour, ampm)).minute(0);
        } else if (this.dayNames.ar[match[1]]) {
          // Day of week in Arabic
          const dayOfWeek = this.dayNames.ar[match[1]];
          const isNext = match[0].includes('القادم');
          targetTime = this.getNextDayOfWeek(now, dayOfWeek, isNext);
          
          const hour = parseInt(match[3]);
          const ampm = match[5];
          targetTime.hour(this.convertTo24HourAr(hour, ampm)).minute(0);
        }
      }
      
      // Validate time is in the future
      if (targetTime.isBefore(now)) {
        return { 
          success: false, 
          error: language === 'ar' ? 'الوقت المحدد في الماضي' : 'Specified time is in the past' 
        };
      }
      
      return {
        success: true,
        dateTime: targetTime.toDate(),
        formatted: targetTime.format('YYYY-MM-DD HH:mm'),
        relative: targetTime.fromNow()
      };
      
    } catch (error) {
      return { success: false, error: 'Failed to process absolute time' };
    }
  }

  /**
   * Process relative time match
   */
  processRelativeMatch(match, language, timezone) {
    try {
      const now = moment.tz(timezone);
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      let momentUnit;
      if (language === 'en') {
        if (unit.includes('minute')) momentUnit = 'minutes';
        else if (unit.includes('hour') || unit === 'h') momentUnit = 'hours';
        else if (unit.includes('day') || unit === 'd') momentUnit = 'days';
        else if (unit.includes('week') || unit === 'w') momentUnit = 'weeks';
        else if (unit.includes('month') || unit === 'm') momentUnit = 'months';
      } else if (language === 'ar') {
        if (unit.includes('دقيقة') || unit === 'د') momentUnit = 'minutes';
        else if (unit.includes('ساعة') || unit === 'س') momentUnit = 'hours';
        else if (unit.includes('يوم') || unit === 'ي') momentUnit = 'days';
        else if (unit.includes('أسبوع') || unit === 'أ') momentUnit = 'weeks';
        else if (unit.includes('شهر') || unit === 'ش') momentUnit = 'months';
      }
      
      if (!momentUnit) {
        return { success: false, error: 'Unknown time unit' };
      }
      
      const targetTime = now.clone().add(amount, momentUnit);
      
      return {
        success: true,
        dateTime: targetTime.toDate(),
        formatted: targetTime.format('YYYY-MM-DD HH:mm'),
        relative: targetTime.fromNow()
      };
      
    } catch (error) {
      return { success: false, error: 'Failed to process relative time' };
    }
  }

  /**
   * Convert 12-hour to 24-hour format
   */
  convertTo24Hour(hour, ampm) {
    if (!ampm) return hour;
    ampm = ampm.toLowerCase();
    if (ampm === 'pm' && hour !== 12) return hour + 12;
    if (ampm === 'am' && hour === 12) return 0;
    return hour;
  }

  /**
   * Convert 12-hour to 24-hour format for Arabic
   */
  convertTo24HourAr(hour, ampm) {
    if (!ampm) return hour;
    if (ampm === 'مساءً' && hour !== 12) return hour + 12;
    if (ampm === 'صباحاً' && hour === 12) return 0;
    return hour;
  }

  /**
   * Get next occurrence of a day of week
   */
  getNextDayOfWeek(currentTime, targetDay, isNext = false) {
    const current = currentTime.clone();
    const currentDay = current.day();
    let daysToAdd = targetDay - currentDay;
    
    if (daysToAdd <= 0 || isNext) {
      daysToAdd += 7;
    }
    
    return current.add(daysToAdd, 'days');
  }

  /**
   * Suggest time formats based on user input
   */
  suggestFormats(language = 'en') {
    const suggestions = {
      en: [
        'in 30 minutes',
        'in 2 hours',
        'tomorrow at 9am',
        'Monday at 2pm',
        'next Friday at 5:30pm',
        '2024-12-20 15:30',
        'Dec 20, 2024 at 3:30 PM'
      ],
      ar: [
        'بعد ٣٠ دقيقة',
        'بعد ساعتين',
        'غداً في ٩ صباحاً',
        'يوم الاثنين في ٢ مساءً',
        'الجمعة القادمة في ٥:٣٠ مساءً',
        '٢٠٢٤-١٢-٢٠ ١٥:٣٠'
      ]
    };
    
    return suggestions[language] || suggestions.en;
  }
}

// Create singleton instance
const timeParser = new TimeParser();

module.exports = timeParser;