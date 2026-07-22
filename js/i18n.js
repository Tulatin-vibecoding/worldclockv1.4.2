/**
 * i18n.js — 多语言支持模块
 * 默认使用系统语言，支持手动覆盖
 */

window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;

  let currentLang = 'zh-CN';
  let translations = {};
  let loadedLangs = {};

  // 语言名称映射 — 暂时仅中英文
  const LANG_NAMES = {
    'zh-CN': '简体中文', 'en': 'English'
  };

  // 获取系统语言
  function getSystemLang() {
    const lang = (navigator.language || 'zh-CN').split('-')[0];
    if (lang === 'zh') return 'zh-CN';
    if (LANG_NAMES[lang]) return lang;
    return 'en';
  }

  // 加载语言包
  async function loadLang(lang) {
    if (loadedLangs[lang]) return loadedLangs[lang];
    if (lang === 'zh-CN') {
      loadedLangs[lang] = {}; // 简体中文是基础语言
      return {};
    }
    try {
      const resp = await fetch(`lang/${lang}.json`);
      if (!resp.ok) throw new Error('not found');
      const data = await resp.json();
      loadedLangs[lang] = data;
      return data;
    } catch {
      console.warn('[i18n] 语言包加载失败:', lang);
      loadedLangs[lang] = {}; // fallback to empty
      return {};
    }
  }

  // 翻译
  function t(key) {
    if (currentLang === 'zh-CN') return key; // 基础语言直接返回 key
    return translations[key] || key;
  }

  // 切换语言
  async function setLanguage(lang, refreshDom) {
    currentLang = lang;
    document.documentElement.setAttribute('data-lang', lang === 'en' ? 'en' : 'zh');
    translations = await loadLang(lang);
    try { localStorage.setItem('worldclock-lang', lang); } catch {}
    if (refreshDom !== false) scanDOM();
    return translations;
  }

  // 初始化
  async function init() {
    const saved = (() => { try { return localStorage.getItem('worldclock-lang'); } catch { return null; } })();
    const lang = saved || getSystemLang();
    await setLanguage(lang);
    return currentLang;
  }

  // 获取可用语言列表
  function getAvailableLangs() {
    return Object.keys(LANG_NAMES).map(k => ({ code: k, name: LANG_NAMES[k] }));
  }

  // DOM 扫描：替换所有 data-i18n 元素的文本 + placeholder
  function scanDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        if (el.tagName === 'INPUT' && el.type === 'text') {
          el.placeholder = t(key);
        } else {
          el.textContent = t(key);
        }
      }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
  }

  // 城市名称显示规则
  function formatCityName(city) {
    return (W._nameFormatCity && W._nameFormatCity(city)) || city.name;
  }

  // 国家名称显示规则
  function formatCountryName(city) {
    return (W._nameFormatCountry && W._nameFormatCountry(city)) || '';
  }

  W.i18n = { init, t, setLanguage, getAvailableLangs, getCurrentLang: () => currentLang, formatCityName, formatCountryName, scanDOM };
  W._ = function(k) { return (W.i18n && W.i18n.t(k)) || k; };
})();
