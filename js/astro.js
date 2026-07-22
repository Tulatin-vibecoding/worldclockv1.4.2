/**
 * astro.js — 天文计算模块 (日出/日落/白昼时长)
 * 基于 Meeus 算法 + 海拔修正 + 50" 大气折射，纯本地计算
 */
(function () {
  if (typeof WorldClock === 'undefined') window.WorldClock = {};

  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const EARTH_ECCENTRICITY = 0.0167;

  // 儒略日
  function toJulianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // 日心纪元数（从 J2000.0 起）
  function daysFromJ2000(jd) {
    return jd - 2451545.0;
  }

  // 太阳赤纬和时差（返回弧度）
  function sunDeclinationEquation(jd) {
    const n = daysFromJ2000(jd);
    const M = ((357.5291 + 0.98560028 * n) % 360) * RAD;
    const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
    const lambda = (((280.4665 + 0.98564736 * n) % 360) * RAD + C);
    const epsilon = (23.4393 - 0.0000004 * n) * RAD;
    const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
    let eot = (280.4665 + 0.98564736 * n) % 360;
    eot = (eot - C * DEG) % 360;
    const y = Math.tan(epsilon / 2) * Math.tan(epsilon / 2);
    eot = y * Math.sin(2 * lambda) - 2 * EARTH_ECCENTRICITY * Math.sin(M) + 4 * EARTH_ECCENTRICITY * y * Math.sin(M) * Math.cos(2 * lambda) - 0.5 * y * y * Math.sin(4 * lambda) - 1.25 * EARTH_ECCENTRICITY * EARTH_ECCENTRICITY * Math.sin(2 * M);
    eot = eot * 4 * DEG; // 弧度 → 分钟
    return { declination, eot };
  }

  // 计算日出/日落时间
  // elevation: 海拔 (米), 默认 0
  function calcSunTimes(lat, lon, date, tzOffsetHours, elevation) {
    elevation = elevation || 0;
    const jd = toJulianDay(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
    const { declination, eot } = sunDeclinationEquation(jd);
    const latRad = lat * RAD;

    // 大气折射 50" + 海拔修正
    const dip = (elevation > 0) ? Math.sqrt(2 * elevation / 6371000) * DEG : 0;
    const alt = (-0.8333 - dip) * RAD;
    const altSea = -0.8333 * RAD;

    const cosHA = (Math.sin(alt) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));
    const cosHASea = (Math.sin(altSea) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination));

    if (cosHA > 1)  return mkPolar(1440, 'day');
    if (cosHA < -1) return mkPolar(0, 'night');

    const ha = Math.acos(cosHA);
    const haSea = Math.acos(Math.max(-1, Math.min(1, cosHASea)));
    const elevCorr = Math.round((ha - haSea) * DEG / 15 * 3600); // 秒

    const sunsetUT  = 12 - lon / 15 + (ha * DEG / 15) - eot / 60;
    const sunriseUT = 12 - lon / 15 - (ha * DEG / 15) - eot / 60;

    const rawSunset  = ((sunsetUT  % 24) + 24) % 24;
    const rawSunrise = ((sunriseUT % 24) + 24) % 24;

    const tzOffset = (tzOffsetHours != null) ? tzOffsetHours : (lon / 15);

    function utToLocal(utHours) {
      const h = utHours + tzOffset;
      const hh = Math.floor(((h % 24) + 24) % 24);
      const mm = Math.floor((h - Math.floor(h)) * 60);
      const ss = Math.round(((h - Math.floor(h)) * 60 - mm) * 60);
      return { h: hh, m: mm, s: ss >= 60 ? 0 : ss, date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm, ss) };
    }

    const sunrise = utToLocal(rawSunrise);
    const sunset  = utToLocal(rawSunset);
    const daylight = Math.round(ha * 2 * DEG / 15 * 60);

    return { sunrise, sunset, daylight, polar: null, elevationCorrection: elevCorr };
  }

  function mkPolar(dl, type) {
    return { sunrise: null, sunset: null, daylight: dl, polar: type, elevationCorrection: 0 };
  }

  // 格式化时间 "HH:MM"
  function fmtTime(d) {
    if (!d) return '--:--';
    if (d.h !== undefined) return String(d.h).padStart(2,'0') + ':' + String(d.m).padStart(2,'0');
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  // 格式化精确时间 "HH:MM:SS"
  function fmtTimeSec(d) {
    if (!d) return '--:--:--';
    if (d.h !== undefined) return String(d.h).padStart(2,'0') + ':' + String(d.m).padStart(2,'0') + ':' + String((d.s||0)).padStart(2,'0');
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
  }

  // 格式化时长 "X小时Y分钟"
  function fmtDuration(minutes) {
    if (minutes >= 1440) return '24:00';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0 && m === 0) return '0:00';
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }

  // 格式化海拔修正
  function fmtElevCorr(minutes) {
    if (!minutes || minutes === 0) return '';
    const sign = minutes > 0 ? '+' : '';
    return sign + minutes + '分钟';
  }

  // 太阳 3D 位置 — 供 globe shader 使用
  function getSunPosition(date) {
    const jd = toJulianDay(date);
    const n = daysFromJ2000(jd);
    const M = ((357.5291 + 0.98560028 * n) % 360) * RAD;
    const C = 1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M);
    const lambda = (((280.4665 + 0.98564736 * n) % 360) + C) * RAD;
    const epsilon = (23.4393 - 0.0000004 * n) * RAD;
    const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
    const gmst = ((280.4606 + 360.98564736 * n) % 360) * RAD;
    return { declination, ssLng: ra - gmst };
  }

  function sunPosTo3D(declination, ssLng) {
    const latRad = declination;
    const lngRad = ssLng;
    return { x: Math.cos(latRad) * Math.cos(lngRad), y: Math.sin(latRad), z: -Math.cos(latRad) * Math.sin(lngRad) };
  }

  // 公开 API
  WorldClock.Astro = {
    calcSunTimes,
    getSunPosition,
    sunPosTo3D,
    fmtTimeSec,
    fmtDuration,
  };
})();
