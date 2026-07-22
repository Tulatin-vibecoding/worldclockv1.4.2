/**
 * 世界时间 - 城市数据库（按区域拆分加载）
 * js/cities/*.js 各文件将数据推入 _cityRegions
 */
window.WorldClock = window.WorldClock || {};

// 区域文件按顺序加载后，扁平化到 CITIES
(function initCities() {
  var W = window.WorldClock;
  W.CITIES = [].concat.apply([], W._cityRegions);
  W.getCityByName = function(name, tz) {
    if (tz) {
      var m = W.CITIES.find(function(c) { return c.name === name && c.timezone === tz; });
      if (m) return m;
    }
    return W.CITIES.find(function(c) { return c.name === name; }) || null;
  };
})();
