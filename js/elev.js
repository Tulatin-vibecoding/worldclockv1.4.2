/**
 * elev.js — 海拔数据加载
 * 从 data/elevations.json 加载，缓存到 W._elevations
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;

  W._elevations = {};
  W._elevationsLoaded = false;

  async function loadElevations() {
    if (W._elevationsLoaded) return;
    try {
      const resp = await fetch('data/elevations.json');
      if (resp.ok) {
        W._elevations = await resp.json();
        W._elevationsLoaded = true;
      }
    } catch(e) {
      console.warn('[Elev] 海拔数据加载失败:', e.message);
      W._elevationsLoaded = true; // 标记已尝试，不再重试
    }
  }

  // 预加载
  document.addEventListener('DOMContentLoaded', loadElevations);
})();
