/**
 * name-formatter.js — 城市/国家名称格式化
 * 规则：非英文 → "中文 (English)"，英文 → 仅英文
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  var W = window.WorldClock;

  function getLang() {
    return (W.i18n && W.i18n.getCurrentLang()) || 'zh-CN';
  }

  function city(c) {
    if (!c) return '';
    if (getLang() === 'en') return c.name_en || c.name;
    if (c.name_en && c.name_en !== c.name) {
      return c.name + ' (' + c.name_en + ')';
    }
    return c.name;
  }

  function country(c) {
    if (!c) return '';
    if (getLang() === 'en') return c.country_en || c.country || '';
    return c.country || '';
  }

  W.NameFormatter = { city: city, country: country };

  // 向后兼容：i18n 模块的旧接口通过这里代理
  W._nameFormatCity = city;
  W._nameFormatCountry = country;
})();
