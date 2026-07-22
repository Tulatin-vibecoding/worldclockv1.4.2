/**
 * 世界时间 - 主应用逻辑
 *
 * 统筹管理搜索、城市选择、时差计算、UI渲染
 * 连接各模块：Map, Clock, ThemeManager
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';

  const W = window.WorldClock;
  const I = window.WorldClock.i18n || { t: k=>k, formatCityName: c=>c.name, formatCountryName: c=>c.country };
  const Clock = window.WorldClock.Clock;
  const Globe = window.WorldClock.Globe;
  const ThemeManager = window.WorldClock.ThemeManager;

  // ========== 应用状态 ==========
  let selectedCity1 = null;
  let selectedCity2 = null;
  let activeSearchResults = [];
  let searchHighlightIndex = -1;

  // ========== DOM 引用缓存 ==========
  let searchInput, searchResults, cityCard1, cityCard2, diffIndicator;
  let mapContainer;

  // ========== 初始化 ==========
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDomElements();
    initTheme();

    // i18n 先行，确保渲染时 t() 可用
    if (W.i18n) await W.i18n.init();

    await initGlobe();
    initSearch();
    renderQuickChips();
    updateAll();
    startClock();

    // DOM 扫描应用语言包
    if (W.i18n) W.i18n.scanDOM();

    console.log('[世界时间] v1.3 就绪');
    console.log('  - 城市:', W.CITIES.length, '个');
    console.log('  - 主题:', ThemeManager.listThemes().map(t => t.name).join(', '));
    console.log('  - 语言:', W.i18n ? W.i18n.getCurrentLang() : 'zh-CN');

    // 汉堡菜单交互
    initMenu();
  });

  function initMenu() {
    const toggle = document.getElementById('menuToggle');
    const menu = document.getElementById('slideMenu');
    const overlay = document.getElementById('menuOverlay');
    if (!toggle || !menu || !overlay) return;

    function open() { toggle.classList.add('open'); menu.classList.add('open'); overlay.classList.add('show'); }
    function close() { toggle.classList.remove('open'); menu.classList.remove('open'); overlay.classList.remove('show'); }

    toggle.addEventListener('click', () => { toggle.classList.contains('open') ? close() : open(); });
    overlay.addEventListener('click', close);

    // 城市详情入口
    (document.getElementById('menuCityDetail')||{addEventListener:()=>{}}).addEventListener('click', () => {
      close();
      window.WorldClock.Detail.open();
    });

    // 城市比较入口
    document.getElementById('menuCityCompare').addEventListener('click', () => {
      close();
      window.WorldClock.Compare.open();
    });

    // 开发者选项入口
    document.getElementById('menuDevOptions').addEventListener('click', () => {
      close();
      openDevPanel();
    });

    // 面板关闭按钮
    document.getElementById('closeCityDetail').addEventListener('click', () => window.WorldClock.Detail.close());
    (document.getElementById('closeCityCompare')||{addEventListener:()=>{}}).addEventListener('click', () => window.WorldClock.Compare.close());
    (document.getElementById('closeDev')||{addEventListener:()=>{}}).addEventListener('click', closeDevPanel);

    // 比较面板：搜索
    window.WorldClock.Compare.setup();

    // 详情面板搜索
    document.getElementById('detailSearch').addEventListener('input', function() {
      const q = this.value.trim();
      const body = document.getElementById('detailBody');
      if (!q) { body.innerHTML = '<p class="detail-empty">' + W._('搜索一个城市查看详情') + '</p>'; return; }
      const results = searchCities(q);
      if (!results.length) { body.innerHTML = '<p class="detail-empty">' + W._('无匹配城市') + '</p>'; return; }
      body.innerHTML = results.slice(0, 15).map(city =>
        renderSearchRow(city, { showCountry: true, showOffset: true })
      ).join('');
      body.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => window.WorldClock.Detail.show(item.dataset.city, item.dataset.tz));
      });
    });
  }

  // ========== DOM 缓存 ==========
  function cacheDomElements() {
    searchInput = document.getElementById('searchInput');
    searchResults = document.getElementById('searchResults');
    cityCard1 = document.getElementById('cityCard1');
    cityCard2 = document.getElementById('cityCard2');
    diffIndicator = document.getElementById('diffIndicator');
    mapContainer = document.getElementById('mapContainer');
  }

  // ========== 主题初始化 ==========
  function initTheme() {
    // 应用默认主题
    ThemeManager.setTheme('light');
    // 覆盖本地存储的主题设置
    const startupTheme = localStorage.getItem('wc-theme') || 'auto';
    if (startupTheme === 'auto') {
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      ThemeManager.setTheme(isDark ? 'dark' : 'light');
    } else {
      ThemeManager.setTheme(startupTheme);
    }

    // 监听主题变更 — 3D 地球颜色固定，不需要刷新
    ThemeManager.onChange(() => {});
  }

  // ========== 3D 地球初始化 ==========
  async function initGlobe() {
    if (!Globe || !mapContainer) {
      console.warn('[App] Globe 模块或容器未就绪');
      return;
    }

    await Globe.init(mapContainer, {
      onMarkerClick: function(city) {
        // 全屏下不退出, 直接在屏内显示 tooltip
        handleCitySelect(city);
      }
    });

    // 设置初始选中城市
    Globe.setSelected(
      selectedCity1 ? selectedCity1.name : null,
      selectedCity2 ? selectedCity2.name : null
    );

    // 初始化后恢复 FPS 设置
    try {
      const fps = parseInt(localStorage.getItem('wc-fps-cap'));
      if (!isNaN(fps)) Globe?.setFpsCap(fps);
    } catch {}

    // 全屏按钮
    setupGlobeFullscreen(mapContainer);

    // 确保首帧渲染
    setTimeout(() => Globe?.resize?.(), 100);
    setTimeout(() => Globe?.forceRender?.(), 200);
  }

  function setupGlobeFullscreen(container) {
    if (!container) return;

    const btn = document.createElement('button');
    btn.className = 'globe-fullscreen-btn';
    btn.innerHTML = '⛶';
    btn.title = '全屏';
    container.appendChild(btn);

    function enterFS() {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    }

    function exitFS() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
      }
    }

    function toggle() {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        exitFS();
      } else {
        enterFS();
      }
    }

    btn.addEventListener('click', toggle);

    // 全屏变化时更新按钮 + resize
    function onFSChange() {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      btn.innerHTML = isFS ? '✕' : '⛶';
      btn.title = isFS ? '退出全屏' : '全屏';
      document.body.classList.toggle('globe-fullscreen', isFS);
      setTimeout(() => { Globe?.resize?.(); Globe?.forceRender?.(); }, 200);
    }
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);

    // 清除旧方案残留
    window._toggleGlobeFullscreen = toggle;
  }

  // ========== 统一搜索列表项渲染 ==========
  /**
   * 渲染单条搜索结果为 HTML, 三处搜索共用
   * @param {Object} city  城市数据
   * @param {Object} opts  选项: showCountry, showOffset, isSelected, extraClass
   * @returns {string} HTML
   */
  function renderSearchRow(city, opts) {
    const o = opts || {};
    const offsetStr = Clock.getOffsetDisplay(city.timezone);
    const cls = o.extraClass || '';
    return `<div class="search-result-item ${cls}" data-city="${city.name}" data-tz="${city.timezone}">
      <div class="city-info">
        <span class="city-name">${I.formatCityName(city)}</span>
        ${o.showCountry !== false ? `<span class="city-country">${I.formatCountryName(city)}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${o.isSelected ? '<span class="already-selected">' + W._('已选') + '</span>' : ''}
        ${o.showOffset !== false ? `<span class="city-offset">${offsetStr}</span>` : ''}
      </div>
    </div>`;
  }
  W._renderSearchRow = renderSearchRow;

  // ========== 搜索 ==========
  function initSearch() {
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      const results = searchCities(searchInput.value);
      renderSearchResults(results);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (!searchResults.classList.contains('active')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchHighlightIndex = Math.min(searchHighlightIndex + 1, activeSearchResults.length - 1);
        highlightSearchItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchHighlightIndex = Math.max(searchHighlightIndex - 1, 0);
        highlightSearchItem();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchHighlightIndex >= 0 && searchHighlightIndex < activeSearchResults.length) {
          handleCitySelect(activeSearchResults[searchHighlightIndex].name, activeSearchResults[searchHighlightIndex].timezone);
        } else if (activeSearchResults.length > 0) {
          handleCitySelect(activeSearchResults[0].name, activeSearchResults[0].timezone);
        }
      } else if (e.key === 'Escape') {
        closeSearch();
        searchInput.blur();
      }
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) {
        const results = searchCities(searchInput.value);
        renderSearchResults(results);
      }
    });

    // 外部点击关闭搜索
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) {
        closeSearch();
      }
    });
  }

  function searchCities(query) {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const cities = window.WorldClock.CITIES || [];
    const boundary = /[a-z]/.test(q) ? '\\b' : '(?<![\\w])';
    const re = new RegExp(boundary + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const test = (s) => re.test(s) || (s && s.toLowerCase().includes(q) && /[\u4e00-\u9fff]/.test(q));
    return cities.filter(c =>
      test(c.name) || (c.name_en && test(c.name_en)) ||
      test(c.country) || (c.country_en && test(c.country_en)) ||
      test(c.timezone)
    ).slice(0, 15);
  }
  window.WorldClock.searchCities = searchCities;

  function renderSearchResults(results) {
    if (!searchResults) return;

    searchHighlightIndex = -1;
    activeSearchResults = results;

    if (results.length === 0 && searchInput.value.trim()) {
      searchResults.innerHTML = '<div class="no-results">未找到匹配的城市</div>';
      searchResults.classList.add('active');
      return;
    }
    if (results.length === 0) {
      searchResults.classList.remove('active');
      return;
    }

    searchResults.innerHTML = results.map(city => {
      const isSelected = (selectedCity1 && selectedCity1.name === city.name) ||
                         (selectedCity2 && selectedCity2.name === city.name);
      return renderSearchRow(city, { showCountry: true, showOffset: true, isSelected });
    }).join('');

    // 绑定点击
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        handleCitySelect(item.dataset.city, item.dataset.tz);
      });
    });

    searchResults.classList.add('active');
  }

  function highlightSearchItem() {
    const items = searchResults.querySelectorAll('.search-result-item');
    items.forEach((item, i) => {
      if (i === searchHighlightIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  function closeSearch() {
    if (searchResults) searchResults.classList.remove('active');
    if (searchInput) searchInput.value = '';
    searchHighlightIndex = -1;
    activeSearchResults = [];
  }

  // ========== 快捷城市（含记忆） ==========
  const RECENT_KEY = 'worldclock-recent';
  const MAX_RECENT = 5;

  function getRecentCities() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveRecentCities(list) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch {}
  }

  function addRecentCity(cityName, tz) {
    if (!cityName) return;
    const key = tz ? cityName + '|||' + tz : cityName;
    let list = getRecentCities();
    list = list.filter(c => c !== key && c !== cityName && c.split('|||')[0] !== cityName);
    list.unshift(key);
    saveRecentCities(list);
    renderQuickChips();
  }

  function removeRecentCity(cityName, tz) {
    const key = tz ? cityName + '|||' + tz : cityName;
    let list = getRecentCities().filter(c => c !== key && c !== cityName && c.split('|||')[0] !== cityName);
    saveRecentCities(list);
    renderQuickChips();
  }

  function getQuickCities() {
    const recent = getRecentCities();
    const result = [];
    for (const name of recent) {
      if (window.WorldClock.getCityByName(name)) { result.push(name); }
    }
    return result;
  }

  function renderQuickChips() {
    const section = document.querySelector('.quick-section');
    if (!section) return;
    const label = section.querySelector('.section-label');
    section.querySelectorAll('.quick-chip, .no-city').forEach(c => c.remove());

    const cities = getQuickCities();
    if (!cities.length) {
      const empty = document.createElement('span');
      empty.className = 'no-city';
      empty.textContent = W._('无');
      section.appendChild(empty);
      if (label) section.prepend(label);
      return;
    }

    cities.forEach(entry => {
      const parts = String(entry).split('|||');
      const name = parts[0], tz = parts[1] || null;
      const btn = document.createElement('button');
      btn.className = 'quick-chip';
      btn.dataset.city = name;
      if (tz) btn.dataset.tz = tz;
      const city = window.WorldClock.getCityByName(name, tz);
      btn.textContent = city ? W.i18n ? W.i18n.formatCityName(city) : name : name;

      // 点击选中
      btn.addEventListener('click', e => {
        if (e.target.classList.contains('chip-del')) return;
        handleCitySelect(name, btn.dataset.tz);
      });

      // 长按显示删除
      let pressTimer;
      btn.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(() => showChipDelete(btn), 600);
      });
      btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
      btn.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      section.appendChild(btn);
    });
    updateQuickChips();
  }

  function showChipDelete(chip) {
    const name = chip.dataset.city;
    const tz = chip.dataset.tz;
    const storedKey = tz ? name + '|||' + tz : name;
    const recents = getRecentCities();
    if (!recents.includes(storedKey) && !recents.includes(name)) return;
    if (chip.querySelector('.chip-del')) return;

    const del = document.createElement('span');
    del.className = 'chip-del';
    del.textContent = '×';
    del.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      removeRecentCity(name, tz);
    });
    chip.appendChild(del);
    // 5 秒后自动隐藏
    setTimeout(() => { if (del.parentNode) del.remove(); }, 5000);
  }

  // 点击空白隐藏所有删除按钮
  document.addEventListener('click', e => {
    if (!e.target.closest('.quick-chip')) {
      document.querySelectorAll('.chip-del').forEach(d => d.remove());
    }
  });

  // ========== 城市选择逻辑 ==========
  function handleCitySelect(cityName, tz) {
    const city = window.WorldClock.getCityByName(cityName, tz);
    if (!city) return;

    // 用 name+timezone 精确比较（处理同名不同国城市）
    const isSame = (a, b) => a && b && a.name === b.name && a.timezone === b.timezone;

    // 已选中相同城市则只聚焦
    if (isSame(selectedCity1, city)) {
      closeSearch();
      focusGlobeCity(city.name);
      return;
    }
    if (isSame(selectedCity2, city)) {
      closeSearch();
      focusGlobeCity(city.name);
      return;
    }

    if (!selectedCity1) {
      selectedCity1 = city;
    } else if (!selectedCity2) {
      selectedCity2 = city;
    } else {
      selectedCity1 = selectedCity2;
      selectedCity2 = city;
    }

    updateAll();
    closeSearch();
    addRecentCity(city.name, city.timezone);
    focusGlobeCity(city.name);
  }

  function focusGlobeCity(name) {
    requestAnimationFrame(() => {
      const G = window.WorldClock && window.WorldClock.Globe;
      if (G && G.focusCity) G.focusCity(name);
    });
  }

  function removeCity(slotNum) {
    if (slotNum === 1) {
      selectedCity1 = selectedCity2;
      selectedCity2 = null;
    } else {
      selectedCity2 = null;
    }
    updateAll();
  }


  // 暴露到全局（模块：detail.js / compare.js）
  window.WorldClock.App = {
    selectCity: handleCitySelect,
    removeCity: removeCity,
    showDetail: function(name) {
      const body = document.getElementById('detailBody');
      body.style.transition = 'opacity 0.15s ease';
      body.style.opacity = '0';
      setTimeout(() => {
        window.WorldClock.Detail.show(name);
        body.style.opacity = '1';
      }, 150);
    },
    getSelectedCities: function() {
      return { city1: selectedCity1, city2: selectedCity2 };
    }
  };

  // ========== UI 渲染 ==========
  function renderCityCard(cardEl, city, slotNum) {
    if (!cardEl) return;

    if (!city) {
      cardEl.className = 'city-card';
      cardEl.innerHTML = `
        <div class="card-label">${W._('城市')} ${slotNum}</div>
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>${W._('搜索或点击地图选择城市')}</span>
        </div>
      `;
      return;
    }

    const timeData = Clock.getTimeData(city.timezone);
    cardEl.className = 'city-card filled';
    cardEl.innerHTML = `
      <button class="remove-btn" onclick="WorldClock.App.removeCity(${slotNum})" title="移除">×</button>
      <div class="card-label">${W._('城市')} ${slotNum}</div>
      <div class="city-name-display">${I.formatCityName(city)}</div>
      <div class="city-country-display">${I.formatCountryName(city)}</div>
      <div class="time-display">
        ${timeData.hours}<span class="colon">:</span>${timeData.minutes}<span class="seconds"><span class="colon">:</span>${timeData.seconds}</span>
      </div>
      <div class="date-display">${timeData.dateStr}</div>
      <div class="offset-display">${timeData.offsetDisplay}</div>
    `;
  }

  function renderDiff() {
    if (!diffIndicator) return;

    if (!selectedCity1 || !selectedCity2) {
      diffIndicator.innerHTML = '<span class="diff-placeholder">' + W._('← 选择两个城市查看时差 →') + '</span>';
      return;
    }

    const diff = Clock.calculateDifference(selectedCity1, selectedCity2);
    diffIndicator.innerHTML = `
      <div class="diff-line"></div>
      <div class="diff-badge">
        <div class="diff-value">${diff.valueText}</div>
        <div class="diff-label">${W._('时间差')}</div>
        <div class="diff-detail">${diff.detailText}</div>
      </div>
      <div class="diff-line"></div>
    `;
  }

  function updateQuickChips() {
    document.querySelectorAll('.quick-chip').forEach(chip => {
      const cityName = chip.dataset.city;
      if ((selectedCity1 && selectedCity1.name === cityName) ||
          (selectedCity2 && selectedCity2.name === cityName)) {
        chip.classList.add('used');
      } else {
        chip.classList.remove('used');
      }
    });
  }

  function updateAll() {
    renderCityCard(cityCard1, selectedCity1, 1);
    renderCityCard(cityCard2, selectedCity2, 2);
    renderDiff();
    updateQuickChips();

    // 同步地图标记
    if (Globe && Globe.setSelected) {
      Globe.setSelected(
        selectedCity1 ? selectedCity1.name : null,
        selectedCity2 ? selectedCity2.name : null
      );
    }
  }

  // ========== 时钟更新 ==========
  function startClock() {
    setInterval(() => {
      // 只更新已选中城市的时钟（避免不必要的 DOM 操作）
      if (selectedCity1) renderCityCard(cityCard1, selectedCity1, 1);
      if (selectedCity2) renderCityCard(cityCard2, selectedCity2, 2);
    }, 1000);
  }

  // ========== 开发者选项 ==========
  function openDevPanel() {
    // 直接隐藏其他面板, 不触发 close (避免延迟 resume 竞态)
    document.getElementById('cityDetailPanel').classList.remove('open');
    document.getElementById('cityComparePanel').classList.remove('open');
    // 释放比较面板资源
    W.MiniGlobe?.destroy();
    if (document.getElementById('miniGlobeContainer')) document.getElementById('miniGlobeContainer').style.display = 'none';
    document.getElementById('devPanel').classList.add('open');
    W.Globe?.pause();
    initDevUI();
  }

  function closeDevPanel() {
    document.getElementById('devPanel').classList.remove('open');
    setTimeout(() => {
      const anyOpen = ['cityDetailPanel','cityComparePanel','devPanel'].some(id => document.getElementById(id).classList.contains('open'));
      if (!anyOpen) {
        W.Globe?.resume();
        requestAnimationFrame(() => requestAnimationFrame(() => W.Globe?.forceRender()));
      }
    }, 350);
  }

  let devUIInitialized = false;
  function initDevUI() {
    if (!W.Dev || !W.i18n || devUIInitialized) return;
    devUIInitialized = true;
    // 语言选择器
    const sel = document.getElementById('langSelect');
    if (sel && sel.options.length === 0 && W.i18n) {
      sel.innerHTML = '<option value="">系统默认</option>' +
        W.i18n.getAvailableLangs().map(l => `<option value="${l.code}">${l.name}</option>`).join('');
      sel.value = W.i18n.getCurrentLang();
      sel.addEventListener('change', async () => {
        if (!sel.value) { try { localStorage.removeItem('worldclock-lang'); } catch {} sel.value = 'zh-CN'; }
        await W.i18n.setLanguage(sel.value || 'zh-CN');
        renderQuickChips(); // 刷新城市标签
        updateAll(); // 刷新主页面 (城市卡片 + 时间差)
      });
    }

    // FPS 选择器
    const fpsSel = document.getElementById('fpsSelect');
    const FPS_OPTS = [{v:30,k:'30 FPS'},{v:60,k:'60 FPS'},{v:0,k:'不限制'}];
    function populateFpsSelect() {
      if (!fpsSel) return;
      const cur = fpsSel.value || '30';
      fpsSel.innerHTML = FPS_OPTS.map(o => `<option value="${o.v}">${W._(o.k)}</option>`).join('');
      fpsSel.value = cur;
      Globe?.setFpsCap(parseInt(cur) || 0);
    }
    if (fpsSel) {
      populateFpsSelect();
      const saved = parseInt(localStorage.getItem('wc-fps-cap'));
      if (!isNaN(saved) && FPS_OPTS.some(o => o.v === saved)) {
        fpsSel.value = String(saved);
        Globe?.setFpsCap(saved);
      }
      fpsSel.addEventListener('change', () => {
        const val = parseInt(fpsSel.value) || 0;
        localStorage.setItem('wc-fps-cap', String(val));
        Globe?.setFpsCap(val);
      });
    }

    // 主题选择器
    const themeSel = document.getElementById('themeSelect');
    if (themeSel) {
      const THEMES = [
        {v:'auto', k:'跟随系统'},
        {v:'light', k:'浅色'},
        {v:'dark', k:'深色'},
        {v:'warm', k:'暖色'}
      ];
      themeSel.innerHTML = THEMES.map(t => `<option value="${t.v}">${W._(t.k)}</option>`).join('');
      // 读本地存储
      const savedTheme = localStorage.getItem('wc-theme') || 'auto';
      themeSel.value = savedTheme;
      applyTheme(savedTheme);
      themeSel.addEventListener('change', () => {
        const val = themeSel.value;
        localStorage.setItem('wc-theme', val);
        applyTheme(val);
      });
      // 跟随系统色变化
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if (localStorage.getItem('wc-theme') === 'auto') applyTheme('auto');
        });
      }
    }

    // 触控调试 - 放在崩溃日志下方
    const debugTouch = document.getElementById('toggleDebugTouch');
    if (debugTouch) {
      debugTouch.addEventListener('change', function() {
        const G = window.WorldClock.Globe;
        if (G && G._debugTouch) G._debugTouch(this.checked);
      });
    }

    function applyTheme(mode) {
      if (mode === 'auto') {
        const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        ThemeManager.setTheme(isDark ? 'dark' : 'light');
      } else {
        ThemeManager.setTheme(mode);
      }
    }

    // 崩溃日志
    (document.getElementById('toggleCrash')||{addEventListener:()=>{}}).addEventListener('change', function() {
      if (this.checked) W.Dev.enableCrashLog();
      document.getElementById('devLogList').innerHTML = this.checked
        ? renderCrashLogs() : '<div style="color:var(--text-secondary)">崩溃日志已关闭</div>';
    }, { once: true });

    (document.getElementById('btnExportLog')||{addEventListener:()=>{}}).addEventListener('click', () => W.Dev.exportCrashLogs());
    (document.getElementById('btnClearLog')||{addEventListener:()=>{}}).addEventListener('click', () => {
      W.Dev.clearCrashLogs();
      document.getElementById('devLogList').innerHTML = '<div style="color:var(--text-secondary)">日志已清除</div>';
    });

    // 性能监控
    (document.getElementById('togglePerf')||{addEventListener:()=>{}}).addEventListener('change', function() {
      if (this.checked) {
        W.Dev.startPerfMonitor();
        startFpsDisplay();
      } else {
        W.Dev.stopPerfMonitor();
        stopFpsDisplay();
      }
    });

    // UI 测试
    (document.getElementById('btnUITest')||{addEventListener:()=>{}}).addEventListener('click', () => {
      const results = W.Dev.runUITest();
      showTestResults(results);
    });

    // 集成测试
    (document.getElementById('btnIntegrationTest')||{addEventListener:()=>{}}).addEventListener('click', () => {
      const results = W.Dev.runIntegrationTest();
      showTestResults(results);
    });
  }

  // ========== FPS 显示(主页面浮层 + 开发者面板) ==========
  let fpsInterval = null;
  let fpsOverlayEl = null;

  function createFpsOverlay() {
    if (fpsOverlayEl) return;
    fpsOverlayEl = document.createElement('div');
    fpsOverlayEl.id = 'fpsOverlay';
    fpsOverlayEl.style.cssText =
      'position:fixed;top:3.5rem;right:0.75rem;z-index:1000;' +
      'background:rgba(0,0,0,0.72);color:#4ade80;font:11px/1.6 monospace;' +
      'padding:0.4rem 0.6rem;border-radius:6px;pointer-events:none;' +
      'min-width:90px;text-align:right';
    document.body.appendChild(fpsOverlayEl);
  }

  function removeFpsOverlay() {
    if (fpsOverlayEl) { fpsOverlayEl.remove(); fpsOverlayEl = null; }
  }

  function startFpsDisplay() {
    createFpsOverlay();
    if (fpsInterval) clearInterval(fpsInterval);
    fpsInterval = setInterval(updateFpsDisplay, 1000);
  }

  function stopFpsDisplay() {
    if (fpsInterval) { clearInterval(fpsInterval); fpsInterval = null; }
    removeFpsOverlay();
    const devFps = document.getElementById('devFps');
    if (devFps) devFps.innerHTML = '';
  }

  function updateFpsDisplay() {
    const stats = W.Dev.getPerfStats();
    const devFps = document.getElementById('devFps');

    if (!stats.fps) {
      if (devFps) devFps.innerHTML = '';
      return;
    }

    const line = `UI ${stats.fps} | G ${stats.globeFps || 0} | Mg ${stats.mgFps || 0} fps`;
    // 主页面浮层
    if (fpsOverlayEl) fpsOverlayEl.textContent = line;
    // 开发者面板
    if (devFps) {
      devFps.innerHTML = `<span>${line}</span>
        <span style="font-size:0.65rem;color:var(--text-secondary)">均 ${stats.avg} | 低 ${stats.min} | 高 ${stats.max}</span>`;
    }
  }

  function showTestResults(results) {
    const container = document.getElementById('devTestResults');
    container.innerHTML = '<table><tr><th>测试</th><th>状态</th></tr>' +
      results.map(r => `<tr><td>${r.name}</td><td style="color:${r.status==='pass'?'#4a8c5a':'#C1665B'}">${r.status}</td></tr>`).join('') +
      '</table>';
  }

  function renderCrashLogs() {
    const logs = W.Dev.getCrashLogs();
    if (!logs.length) return '<div style="color:var(--text-secondary)">暂无崩溃记录</div>';
    return logs.slice(-20).map(l =>
      `<div class="dev-log-item"><span class="log-time">${l.time.slice(11,19)}</span> <span class="log-type">${l.type}</span> ${l.message}</div>`
    ).join('');
  }

})();
