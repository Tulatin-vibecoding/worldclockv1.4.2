/**
 * 世界时间 - 主题管理系统
 * 基于 CSS 自定义属性（CSS Variables）驱动
 * 支持多主题注册、切换、扩展
 *
 * 主题配置结构：
 * {
 *   name: "主题名称",
 *   variables: {
 *     "--variable-name": "value",
 *     ...
 *   },
 *   styles: { ... }  // 可选的额外样式覆盖
 * }
 */
window.WorldClock = window.WorldClock || {};

window.WorldClock.ThemeManager = (function() {
  'use strict';

  // 已注册的主题集合
  const themes = {};

  // 当前主题名称
  let currentTheme = 'light';

  // 主题切换回调列表
  const changeCallbacks = [];

  // ========== 预置主题 ==========

  /**
   * 默认浅色主题
   */
  const LIGHT_THEME = {
    name: '浅色',
    variables: {
      '--bg': '#F4F7FA',
      '--bg-secondary': '#E8ECF1',
      '--card-bg': '#ffffff',
      '--text': '#2C3E50',
      '--text-secondary': '#6B7B8D',
      '--time-color': '#1A1A1A',
      '--primary': '#C1665B',
      '--primary-light': '#FDF0EE',
      '--primary-dark': '#9B4A41',
      '--border': '#DFE6E9',
      '--border-light': '#F0F3F5',
      '--shadow': '0 4px 12px rgba(0,0,0,0.08)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.10)',
      '--radius': '16px',
      '--radius-sm': '10px',
      '--diff-bg': '#F4F7FA',
      '--diff-border': '#DFE6E9',
      '--map-ocean': '#E8ECF1',
      '--map-land': '#FFFFFF',
      '--map-land-hover': '#F0F3F7',
      '--map-marker': '#C1665B',
      '--map-marker-hover': '#9B4A41',
      '--map-marker-glow': 'drop-shadow(0 0 6px rgba(193,102,91,0.3))',
      '--map-border': '#CBD0D8',
      '--header-gradient': 'linear-gradient(135deg, #C1665B 0%, #D4836E 100%)',
    }
  };

  /**
   * 深色主题
   */
  const DARK_THEME = {
    name: '深色',
    variables: {
      '--bg': '#1a1f2e',
      '--bg-secondary': '#262d3d',
      '--card-bg': '#242b3d',
      '--text': '#e8ecf1',
      '--text-secondary': '#8899aa',
      '--time-color': '#8899aa',
      '--primary': '#d4836e',
      '--primary-light': '#2d1f1c',
      '--primary-dark': '#e8a090',
      '--border': '#334155',
      '--border-light': '#1e293b',
      '--shadow': '0 4px 12px rgba(0,0,0,0.3)',
      '--shadow-lg': '0 8px 24px rgba(0,0,0,0.4)',
      '--radius': '16px',
      '--radius-sm': '10px',
      '--diff-bg': '#242b3d',
      '--diff-border': '#334155',
      '--map-ocean': '#1a2233',
      '--map-land': '#2d3548',
      '--map-land-hover': '#3d4758',
      '--map-marker': '#d4836e',
      '--map-marker-hover': '#e8a090',
      '--map-marker-glow': 'drop-shadow(0 0 8px rgba(212,131,110,0.4))',
      '--map-border': '#4a5568',
      '--header-gradient': 'linear-gradient(135deg, #C1665B 0%, #D4836E 100%)',
    }
  };

  /**
   * 暖色调主题（未来的美化方向之一）
   */
  const WARM_THEME = {
    name: '暖色',
    variables: {
      '--bg': '#fef7ee',
      '--bg-secondary': '#f2e8d5',
      '--card-bg': '#fffdf7',
      '--text': '#3d2e1e',
      '--text-secondary': '#8b7355',
      '--primary': '#d97706',
      '--primary-light': '#fef3c7',
      '--primary-dark': '#b45309',
      '--border': '#fde68a',
      '--border-light': '#fef9e7',
      '--shadow': '0 1px 3px rgba(180,83,9,0.1)',
      '--shadow-lg': '0 10px 25px rgba(180,83,9,0.12)',
      '--radius': '16px',
      '--radius-sm': '10px',
      '--diff-bg': '#fffbeb',
      '--diff-border': '#fde68a',
      '--map-ocean': '#e0f2fe',
      '--map-land': '#e5d5c0',
      '--map-land-hover': '#d4c4af',
      '--map-marker': '#dc2626',
      '--map-marker-hover': '#b91c1c',
      '--map-border': '#c4b5a0',
      '--header-gradient': 'linear-gradient(135deg, #d97706 0%, #ea580c 100%)',
    }
  };

  // ========== 核心方法 ==========

  /**
   * 注册主题
   * @param {string} id - 主题唯一标识
   * @param {object} config - 主题配置 { name, variables, styles }
   */
  function registerTheme(id, config) {
    if (!config || !config.variables) {
      console.warn('[ThemeManager] 主题配置无效，需要 variables 字段');
      return false;
    }
    themes[id] = {
      name: config.name || id,
      variables: { ...config.variables },
      styles: config.styles || {}
    };
    return true;
  }

  /**
   * 切换主题
   * @param {string} id - 主题标识
   */
  function setTheme(id) {
    const theme = themes[id];
    if (!theme) {
      console.warn('[ThemeManager] 主题不存在:', id);
      return false;
    }

    currentTheme = id;

    // 应用 CSS 变量
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.variables)) {
      root.style.setProperty(key, value);
    }

    // 触发回调
    changeCallbacks.forEach(cb => {
      try { cb(id, theme); } catch (e) { console.error(e); }
    });

    return true;
  }

  /**
   * 获取当前主题配置
   */
  function getCurrentTheme() {
    return {
      id: currentTheme,
      config: themes[currentTheme] || null
    };
  }

  /**
   * 获取指定主题配置
   */
  function getTheme(id) {
    return themes[id] || null;
  }

  /**
   * 获取所有已注册主题
   */
  function listThemes() {
    return Object.entries(themes).map(([id, config]) => ({
      id: id,
      name: config.name,
      isActive: id === currentTheme
    }));
  }

  /**
   * 获取 CSS 变量值
   */
  function getVariable(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /**
   * 注册主题变更回调
   * @param {function} callback - (themeId, themeConfig) => void
   */
  function onChange(callback) {
    if (typeof callback === 'function') {
      changeCallbacks.push(callback);
    }
  }

  // ========== 初始化 ==========

  // 注册预置主题
  registerTheme('light', LIGHT_THEME);
  registerTheme('dark', DARK_THEME);
  registerTheme('warm', WARM_THEME);

  // ========== 公开 API ==========
  return {
    registerTheme: registerTheme,
    setTheme: setTheme,
    getCurrentTheme: getCurrentTheme,
    getTheme: getTheme,
    listThemes: listThemes,
    getVariable: getVariable,
    onChange: onChange,
    // 预置主题配置暴露（方便后续扩展）
    PRESETS: {
      LIGHT: LIGHT_THEME,
      DARK: DARK_THEME,
      WARM: WARM_THEME
    }
  };
})();
