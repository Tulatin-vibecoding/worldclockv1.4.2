/**
 * 世界时间 - 时钟计算与格式化模块
 */
window.WorldClock = window.WorldClock || {};

window.WorldClock.Clock = (function() {
  'use strict';
  var W = window.WorldClock;

  // ========== 时区偏移计算 ==========

  /**
   * 获取指定时区的 UTC 偏移（小时）
   * 使用 Intl.DateTimeFormat 确保夏令时准确
   */
  function getTimezoneOffset(tz) {
    try {
      const now = new Date();
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'longOffset',
        hour: 'numeric'
      });
      const parts = fmt.formatToParts(now);
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      if (!tzPart) return 0;
      // 解析 "GMT+08:00" 或 "GMT-05:00"
      const match = tzPart.value.match(/GMT([+-]\d{2}):?(\d{2})?/);
      if (match) {
        const sign = match[1].startsWith('-') ? -1 : 1;
        return sign * (Math.abs(parseInt(match[1])) + (parseInt(match[2] || '0') / 60));
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 获取格式化的 UTC 偏移显示字符串
   * 如 "UTC+8", "UTC-5", "UTC+5:30"
   */
  function getOffsetDisplay(tz) {
    const offset = getTimezoneOffset(tz);
    if (Math.abs(offset) < 0.001) return 'UTC+0';
    const sign = offset >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset));
    const minutes = Math.round((Math.abs(offset) - hours) * 60);
    if (minutes === 0) return `UTC${sign}${hours}`;
    return `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
  }

  // ========== 时间格式化 ==========

  /**
   * 获取指定时区的当前时间字符串 HH:MM:SS
   */
  function getTimeString(tz) {
    try {
      const now = new Date();
      return now.toLocaleTimeString('zh-CN', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return '--:--:--';
    }
  }

  /**
   * 获取指定时区的日期字符串
   */
  function getDateString(tz) {
    try {
      const now = new Date();
      const lang = (window.WorldClock.i18n && window.WorldClock.i18n.getCurrentLang()) || 'zh-CN';
      return now.toLocaleDateString(lang, {
        timeZone: tz,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    } catch (e) {
      return '----';
    }
  }

  /**
   * 获取指定时区的完整时间数据
   * 返回 { timeStr, dateStr, offsetDisplay, offsetHours, hours, minutes, seconds }
   */
  function getTimeData(tz) {
    const timeStr = getTimeString(tz);
    const parts = timeStr.split(':');
    return {
      timeStr: timeStr,
      dateStr: getDateString(tz),
      offsetDisplay: getOffsetDisplay(tz),
      offsetHours: getTimezoneOffset(tz),
      hours: parts[0] || '--',
      minutes: parts[1] || '--',
      seconds: parts[2] || '--'
    };
  }

  // ========== 时差计算 ==========

  /**
   * 计算两个时区之间的时间差
   * 返回 { diffHours, description, city1, city2 }
   * diffHours: tz1 减去 tz2 的小时数
   */
  function calculateDifference(city1, city2) {
    const offset1 = getTimezoneOffset(city1.timezone);
    const offset2 = getTimezoneOffset(city2.timezone);
    const diff = offset1 - offset2;

    let valueText, detailText, isSame = false;
    const i18n = window.WorldClock.i18n;
    const n1 = i18n ? i18n.formatCityName(city1) : city1.name;
    const n2 = i18n ? i18n.formatCityName(city2) : city2.name;

    if (Math.abs(diff) < 0.001) {
      valueText = '0';
      detailText = W._('时间相同');
      isSame = true;
    } else {
      const absHours = Math.floor(Math.abs(diff));
      const absMinutes = Math.round((Math.abs(diff) - absHours) * 60);
      const sign = diff > 0 ? '+' : '-';

      if (absMinutes === 0) {
        valueText = `${sign}${absHours}:00`;
      } else {
        valueText = `${sign}${absHours}:${String(absMinutes).padStart(2, '0')}`;
      }

      const relation = diff > 0 ? (W._('快')) : (W._('慢'));
      const hourWord = W._('小时');
      const minWord = W._('分钟');
      const timeStr = absMinutes === 0
        ? `${absHours} ${hourWord}`
        : `${absHours} ${hourWord} ${absMinutes} ${minWord}`;

      const template = W._('{a} 比 {b} {r} {t}');
      detailText = template.replace('{a}', n1).replace('{b}', n2).replace('{r}', relation).replace('{t}', timeStr);
    }

    return {
      diffHours: diff,
      valueText: valueText,
      detailText: detailText,
      isSame: isSame
    };
  }

  /**
   * 判断指定时区当前是白天还是夜晚
   * 简化版：基于当地时间在 6:00-18:00 之间为白天
   */
  function isDaytime(tz) {
    try {
      const now = new Date();
      const hourStr = now.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false
      });
      const hour = parseInt(hourStr);
      return hour >= 6 && hour < 18;
    } catch (e) {
      return true;
    }
  }

  // ========== 公开 API ==========

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return {
    getTimezoneOffset: getTimezoneOffset,
    getOffsetDisplay: getOffsetDisplay,
    getTimeString: getTimeString,
    getDateString: getDateString,
    getTimeData: getTimeData,
    calculateDifference: calculateDifference,
    haversine: haversine
  };
})();
