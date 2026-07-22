/**
 * 世界时间 - 城市详情面板
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;
  function row(label, value) {
    return `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`;
  }

  let lastDetailCity = null;  // 会话级状态记忆

  function openCityDetail() {
    // 直接隐藏其他面板, 不触发 close (避免延迟 resume 竞态)
    document.getElementById('cityComparePanel').classList.remove('open');
    document.getElementById('devPanel').classList.remove('open');
    // 释放比较面板资源
    W.MiniGlobe?.destroy();
    if (document.getElementById('miniGlobeContainer')) document.getElementById('miniGlobeContainer').style.display = 'none';
    W.Globe?.pause();
    document.getElementById('cityDetailPanel').classList.add('open');
    // 延迟恢复状态, 让面板动画先完成, 避免卡顿
    if (lastDetailCity) {
      document.getElementById('detailSearch').value = lastDetailCity.name;
      requestAnimationFrame(() => showCityDetail(lastDetailCity.name, lastDetailCity.timezone));
    } else {
      document.getElementById('detailSearch').value = '';
      document.getElementById('detailBody').innerHTML = '<p class="detail-empty">' + W._('搜索一个城市查看详情') + '</p>';
    }
  }

  function closeCityDetail() {
    document.getElementById('cityDetailPanel').classList.remove('open');
    // 等面板关闭动画播完(0.3s)再恢复地球, 避免残影穿透
    setTimeout(() => {
      const anyOpen = ['cityDetailPanel','cityComparePanel','devPanel'].some(id => document.getElementById(id).classList.contains('open'));
      if (!anyOpen) {
        W.Globe?.resume();
        requestAnimationFrame(() => requestAnimationFrame(() => W.Globe?.forceRender()));
      }
    }, 350);
  }

  function fmtElevCorr(seconds) {
    // 海拔修正格式化为 XX:XX
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.abs(seconds) % 60;
    return (seconds < 0 ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function showCityDetail(name, tz) {
    const city = W.getCityByName(name, tz);
    if (!city) return;
    lastDetailCity = city;  // 记住上次查看
    const td = W.Clock.getTimeData(city.timezone);
    console.log('[Detail] timeData:', td?.timeStr);
    const elev = W._elevations && W._elevations[city.name];
    const sun = (W.Astro || {}).calcSunTimes
      ? W.Astro.calcSunTimes(city.lat, city.lon, new Date(), td.offsetHours, elev ?? 0)
      : null;
    const coord = `${Math.abs(city.lat).toFixed(2)}° ${city.lat>=0?'N':'S'}, ${Math.abs(city.lon).toFixed(2)}° ${city.lon>=0?'E':'W'}`;

    const elevDisplay = (elev != null) ? `${elev}m` : W._('未知');
    const sunriseDisplay = sun?.sunrise
      ? W.Astro.fmtTimeSec(sun.sunrise) + (sun.elevationCorrection ? ' (' + W._('海拔修正') + ': ' + W._('提前') + ' ' + fmtElevCorr(sun.elevationCorrection) + ')' : '')
      : null;
    const sunsetDisplay = sun?.sunset
      ? W.Astro.fmtTimeSec(sun.sunset) + (sun.elevationCorrection ? ' (' + W._('海拔修正') + ': ' + W._('延后') + ' ' + fmtElevCorr(sun.elevationCorrection) + ')' : '')
      : null;
    const dstStatus = detectDST(city.timezone) ? '✅ ' + W._('是') : '❌ ' + W._('否');

    document.getElementById('detailBody').innerHTML = [
      `<h3 class="detail-city-name">${(W.i18n && W.i18n.formatCityName(city)) || (city.name + ' ' + (city.name_en||''))}</h3>`,
      row(W._('当前时间'), td.timeStr),
      row(W._('UTC 偏移'), td.offsetDisplay),
      row(W._('IANA 时区'), city.timezone),
      row(W._('夏令时'), dstStatus),
      row(W._('经纬度'), coord),
      row(W._('海拔'), elevDisplay),
      sun?.sunrise && row(W._('今日日出'), sunriseDisplay),
      sun?.sunset  && row(W._('今日日落'), sunsetDisplay),
      sun && !sun.polar && row(W._('白昼时长'), W.Astro.fmtDuration(sun.daylight)),
      sun?.polar === 'day'  && row(W._('白昼时长'), W._('极昼')),
      sun?.polar === 'night' && row(W._('白昼时长'), W._('极夜')),
      buildTzSection(city),
      '<div class="detail-disclaimer"><p>' + W._('日出日落时间基于Meeus天文算法+大气折射+海拔修正计算，精度约±2分钟。') + '</p><p>' + W._('本应用仅供日常参考，如有航海、航空、法律等专业需求，请使用权威授时设备。') + '</p></div>',
    ].filter(Boolean).join('');
  }

  function buildTzSection(city) {
    const off = W.Clock.getTimeData(city.timezone).offsetHours;
    const cities = W.CITIES.filter(c => c.name !== city.name && W.Clock.getTimeData(c.timezone).offsetHours === off);
    const chips = cities.length ? cities.map(c => `<span class="tz-city-chip" onclick="WorldClock.App.showDetail('${c.name}')">${(W.i18n && W.i18n.formatCityName(c)) || c.name}</span>`).join('')
      : '<span style="color:var(--text-secondary);font-size:0.75rem">' + W._('无') + '</span>';
    return `<div class="detail-tz"><span class="detail-label">${W._('同一时区城市')}</span><div class="tz-city-list">${chips}</div></div>`;
  }

  function detectDST(tz) {
    const opts = { timeZone: tz, timeZoneName: 'shortOffset' };
    const janOff = parseInt(new Date(2026, 0, 15).toLocaleString('en', opts).match(/GMT([+-]\d+)/)?.[1] || '0');
    const julOff = parseInt(new Date(2026, 6, 15).toLocaleString('en', opts).match(/GMT([+-]\d+)/)?.[1] || '0');
    if (janOff === julOff) return false;
    const nowOff = parseInt(new Date().toLocaleString('en', opts).match(/GMT([+-]\d+)/)?.[1] || '0');
    return nowOff === Math.max(janOff, julOff);
  }

  W.Detail = { open: openCityDetail, close: closeCityDetail, show: showCityDetail };
})();
