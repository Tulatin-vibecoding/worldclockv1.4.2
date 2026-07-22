/**
 * dev.js — 开发者选项（仅调试模式加载）
 * 功能：性能监控、崩溃日志、集成测试、UI测试
 * Release 时不引入此 script 即可移除
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;

  // ========== 崩溃日志 ==========
  const LOG_KEY = 'worldclock-crash-log';
  const MAX_LOG_SIZE = 50 * 1024;  // 50KB
  const MAX_LOG_ENTRIES = 30;       // 最多30条

  let crashLogEnabled = false;

  function enableCrashLog() {
    if (crashLogEnabled) return;
    crashLogEnabled = true;

    window.addEventListener('error', function(e) {
      const entry = {
        time: new Date().toISOString(),
        message: e.message,
        source: e.filename,
        line: e.lineno,
        col: e.colno,
        stack: e.error ? e.error.stack : null
      };
      saveLogEntry('error', entry);
    });

    window.addEventListener('unhandledrejection', function(e) {
      const entry = {
        time: new Date().toISOString(),
        message: String(e.reason),
        stack: e.reason && e.reason.stack ? e.reason.stack : null
      };
      saveLogEntry('unhandled rejection', entry);
    });

    console.log('[Dev] 崩溃日志已启用');
  }

  function saveLogEntry(type, entry) {
    try {
      let logs = [];
      const raw = localStorage.getItem(LOG_KEY);
      if (raw) logs = JSON.parse(raw);
      // 去重：相同错误相邻不重复写入
      const last = logs[logs.length - 1];
      if (last && last.message === entry.message && last.type === type) return;
      logs.push({ type, ...entry });
      // 限制条数
      if (logs.length > MAX_LOG_ENTRIES) logs = logs.slice(-MAX_LOG_ENTRIES);
      // 限制总大小
      let str = JSON.stringify(logs);
      while (str.length > MAX_LOG_SIZE && logs.length > 1) {
        logs.shift();
        str = JSON.stringify(logs);
      }
      localStorage.setItem(LOG_KEY, str);
    } catch(e) {}
  }

  function getCrashLogs() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function exportCrashLogs() {
    const logs = getCrashLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'worldclock-crash-log-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearCrashLogs() {
    localStorage.removeItem(LOG_KEY);
    console.log('[Dev] 崩溃日志已清除');
  }

  // ========== 性能监控 ==========
  let fpsMonitor = null;
  let fpsSamples = [];
  let perfEnabled = false;

  function startPerfMonitor() {
    if (perfEnabled) return;
    perfEnabled = true;
    fpsSamples = [];
    // 通知 globe 开始 FPS 追踪
    if (W.Globe && W.Globe.trackFps) W.Globe.trackFps(true);
    if (W.MiniGlobe && W.MiniGlobe.trackFps) W.MiniGlobe.trackFps(true);
    let lastTime = performance.now();
    let frames = 0;

    function measure() {
      if (!perfEnabled) return;
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const fps = Math.round(frames * 1000 / (now - lastTime));
        fpsSamples.push({ time: now, fps });
        if (fpsSamples.length > 60) fpsSamples.shift();
        frames = 0;
        lastTime = now;
      }
      requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
    console.log('[Dev] 性能监控已启动');
  }

  function getPerfStats() {
    if (!fpsSamples.length) return { fps: 0, min: 0, max: 0, avg: 0 };
    const vals = fpsSamples.map(s => s.fps);
    const globePaused = W.Globe?.isPaused ? W.Globe.isPaused() : false;
    const globeFps = globePaused ? 0 : (W.Globe?.getFps ? W.Globe.getFps() : 0);
    const mgActive = W.MiniGlobe?.isActive ? W.MiniGlobe.isActive() : false;
    const mgFps = mgActive ? (W.MiniGlobe?.getFps ? W.MiniGlobe.getFps() : 0) : 0;
    return {
      fps: vals[vals.length - 1],
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: Math.round(vals.reduce((a,b) => a+b, 0) / vals.length),
      globeFps,
      mgFps
    };
  }

  function stopPerfMonitor() {
    perfEnabled = false;
    fpsSamples = [];
    // 通知 globe 停止 FPS 追踪
    if (W.Globe && W.Globe.trackFps) W.Globe.trackFps(false);
    if (W.MiniGlobe && W.MiniGlobe.trackFps) W.MiniGlobe.trackFps(false);
  }

  // ========== UI 测试 ==========
  function runUITest() {
    const results = [];
    const test = (name, fn) => {
      try { fn(); results.push({ name, status: 'pass' }); }
      catch(e) { results.push({ name, status: 'fail', error: e.message }); }
    };

    test('DOM 完整性', () => {
      const ids = ['searchInput', 'cityCard1', 'cityCard2', 'mapContainer',
        'cityDetailPanel', 'cityComparePanel', 'menuToggle', 'slideMenu'];
      ids.forEach(id => { if (!document.getElementById(id)) throw new Error('Missing: ' + id); });
    });

    test('城市数据完整性', () => {
      const cities = W.CITIES;
      if (!cities || cities.length < 100) throw new Error('城市数据不足');
      if (!W.getCityByName('北京')) throw new Error('北京 not found');
    });

    test('时钟模块', () => {
      const td = W.Clock.getTimeData('Asia/Shanghai');
      if (!td.timeStr || !td.offsetDisplay) throw new Error('Clock 数据异常');
    });

    test('天文模块', () => {
      if (!W.Astro || !W.Astro.calcSunTimes) throw new Error('Astro 模块缺失');
    });

    test('主题模块', () => {
      const themes = W.ThemeManager.listThemes();
      if (!themes || themes.length < 2) throw new Error('主题数据不足');
    });

    console.table(results);
    return results;
  }

  // ========== 集成测试 ==========
  function runIntegrationTest() {
    const results = [];
    const test = (name, fn) => {
      try { fn(); results.push({ name, status: 'pass' }); }
      catch(e) { results.push({ name, status: 'fail', error: e.message }); }
    };

    test('搜索功能', () => {
      const results = W.searchCities('London');
      if (!results || !results.length) throw new Error('搜索 London 无结果');
      const london = results.find(c => c.name === '伦敦');
      if (!london) throw new Error('伦敦不在搜索结果中');
    });

    test('时差计算', () => {
      const bj = W.getCityByName('北京');
      const ny = W.getCityByName('纽约');
      if (!bj || !ny) throw new Error('城市未找到');
      const diff = W.Clock.calculateDifference(bj, ny);
      if (diff.valueText === undefined) throw new Error('时差计算异常');
    });

    test('日出日落计算', () => {
      const bj = W.getCityByName('北京');
      const td = W.Clock.getTimeData(bj.timezone);
      const sun = W.Astro.calcSunTimes(bj.lat, bj.lon, new Date(), td.offsetHours);
      if (!sun || (!sun.sunrise && !sun.polar)) throw new Error('日出日落计算异常');
    });

    test('Haversine 距离', () => {
      const bj = W.getCityByName('北京'), ny = W.getCityByName('纽约');
      // 调用 compare.js 中的 haversine（通过 W.Compare 暴露或内联）
      const dist = W.Clock.haversine(bj.lat, bj.lon, ny.lat, ny.lon);
      if (dist < 5000 || dist > 15000) throw new Error('距离计算异常: ' + dist);
    });

    console.table(results);
    return results;
  }


  // ========== 公开 API ==========
  W.Dev = {
    enableCrashLog,
    getCrashLogs,
    exportCrashLogs,
    clearCrashLogs,
    startPerfMonitor,
    stopPerfMonitor,
    getPerfStats,
    runUITest,
    runIntegrationTest,
  };
})();
