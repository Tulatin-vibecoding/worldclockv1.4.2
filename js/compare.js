/**
 * 世界时间 - 城市比较面板
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;
  const I = W.i18n || { t: k=>k, formatCityName: c=>c.name, formatCountryName: c=>c.country };
  const C = W.Clock;

  let cmpSel = { A: null, B: null };
  let lastCmpState = null;  // 会话级状态记忆

  function openCityCompare() {
    // 直接隐藏其他面板, 不触发 close (避免延迟 resume 竞态)
    document.getElementById('cityDetailPanel').classList.remove('open');
    document.getElementById('devPanel').classList.remove('open');
    W.Globe?.pause();
    W.MiniGlobe?.destroy();
    document.getElementById('miniGlobeContainer').style.display = 'none';
    document.getElementById('miniGlobeTitle').style.display = 'none';
    document.getElementById('cityDetailPanel').classList.remove('open');
    document.getElementById('devPanel').classList.remove('open');
    // 恢复上次选择的城市，否则重置
    if (lastCmpState) {
      cmpSel = { A: lastCmpState.A, B: lastCmpState.B };
      ['A','B'].forEach(l => {
        document.getElementById('cmpSearch'+l).value = cmpSel[l] ? I.formatCityName(cmpSel[l]) : '';
      });
    } else {
      ['A','B'].forEach(l => {
        document.getElementById('cmpSearch'+l).value = '';
        cmpSel[l] = null;
      });
    }
    document.getElementById('cityComparePanel').classList.add('open');
    if (cmpSel.A && cmpSel.B) {
      // 延迟恢复, 让面板动画先完成
      requestAnimationFrame(() => updateCompare());
    } else {
      document.getElementById('cmpResult').innerHTML = '<p class="detail-empty">' + W._('搜索并选择两个城市') + '</p>';
    }
  }

  function closeCityCompare() {
    W.MiniGlobe?.destroy();
    document.getElementById('miniGlobeContainer').style.display = 'none';
    document.getElementById('miniGlobeTitle').style.display = 'none';
    document.getElementById('cityComparePanel').classList.remove('open');
    setTimeout(() => {
      const anyOpen = ['cityDetailPanel','cityComparePanel','devPanel'].some(id => document.getElementById(id).classList.contains('open'));
      if (!anyOpen) {
        W.Globe?.resume();
        requestAnimationFrame(() => requestAnimationFrame(() => W.Globe?.forceRender()));
      }
    }, 350);
  }

  function setupCmpSearch() {
    ['A','B'].forEach(label => {
      const input = document.getElementById('cmpSearch'+label);
      if (!input) return;
      input.addEventListener('input', () => {
        const q = input.value.trim();
        const drop = document.getElementById('cmpDrops'+label) || (() => {
          const d = document.createElement('div');
          d.id = 'cmpDrops'+label;
          d.className = 'cmp-drops';
          input.parentNode.insertBefore(d, input.nextSibling);
          return d;
        })();
        if (!q) { drop.innerHTML = ''; return; }
        const results = W.searchCities(q);
        if (!results.length) { drop.innerHTML = '<div class="search-item none">' + W._('无匹配城市') + '</div>'; return; }
        drop.innerHTML = results.slice(0, 15).map(c => W._renderSearchRow(c, { showCountry: true, showOffset: true, extraClass: 'cmp' })).join('');
        drop.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            cmpSel[label] = W.getCityByName(item.dataset.city, item.dataset.tz);
            input.value = I.formatCityName(cmpSel[label]);
            drop.innerHTML = '';
            // 保存状态供切换恢复
            lastCmpState = { A: cmpSel.A, B: cmpSel.B };
            updateCompare();
          });
        });
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          const drop = document.getElementById('cmpDrops'+label);
          if (drop) drop.innerHTML = '';
        }, 200);
      });
    });
  }

  function updateCompare() {
    const sel = Object.values(cmpSel).filter(v => v);
    const res = document.getElementById('cmpResult');
    if (sel.length < 2) { res.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem">' + W._('至少选择两个城市') + '</div>'; return; }

    let html = buildCompareTable(sel);
    for (let i = 0; i < sel.length; i++) {
      for (let j = i + 1; j < sel.length; j++) {
        html += buildPairCards(sel[i], sel[j], i, j);
      }
    }
    res.innerHTML = html;

    res.querySelectorAll('.wh-calc-btn').forEach(btn => {
      btn.onclick = function() {
        const [ii, jj] = this.dataset.pair.split('-').map(Number);
        const as = +res.querySelector(`.wh-a-start[data-pair="${this.dataset.pair}"]`).value;
        const ae = +res.querySelector(`.wh-a-end[data-pair="${this.dataset.pair}"]`).value;
        const bs = +res.querySelector(`.wh-b-start[data-pair="${this.dataset.pair}"]`).value;
        const be = +res.querySelector(`.wh-b-end[data-pair="${this.dataset.pair}"]`).value;
        const over = workOverlapCustom(sel[ii].timezone, sel[jj].timezone, as, ae, bs, be);
        document.getElementById('whResult-' + this.dataset.pair).innerHTML = buildOverlapResult(sel[ii], sel[jj], over, [as, ae], [bs, be]);
      };
      btn.click();
    });

    // 迷你地球
    const mg = document.getElementById('miniGlobeContainer');
    if (sel.length === 2) {
      document.getElementById('miniGlobeTitle').style.display = 'block';
      mg.style.display = 'block';
      setTimeout(() => { W.MiniGlobe?.destroy(); W.MiniGlobe?.init(mg, sel[0], sel[1]); }, 300);
    } else {
      document.getElementById('miniGlobeTitle').style.display = 'none';
      mg.style.display = 'none';
      W.MiniGlobe?.destroy();
    }
  }

  function buildCompareTable(sel) {
    let t = '<table><tr><th></th>' + sel.map(c => `<th>${I.formatCityName(c)}</th>`).join('') + '</tr>';
    t += '<tr><td>' + W._('当前时间') + '</td>' + sel.map(c => `<td>${C.getTimeData(c.timezone).timeStr}</td>`).join('') + '</tr>';
    t += '<tr><td>' + W._('UTC 偏移') + '</td>' + sel.map(c => `<td>${C.getTimeData(c.timezone).offsetDisplay}</td>`).join('') + '</tr>';
    t += '<tr><td>' + W._('经纬度') + '</td>' + sel.map(c => `<td>${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'}, ${Math.abs(c.lon).toFixed(1)}° ${c.lon>=0?'E':'W'}</td>`).join('') + '</tr>';
    return t + '</table>';
  }

  function buildPairCards(cityA, cityB, i, j) {
    const tdA = C.getTimeData(cityA.timezone);
    const tdB = C.getTimeData(cityB.timezone);
    const diffH = Math.abs(tdA.offsetHours - tdB.offsetHours);
    const dKm = W.Clock.haversine(+cityA.lat, +cityA.lon, +cityB.lat, +cityB.lon);
    const sameDay = tdA.dateStr === tdB.dateStr;
    const sameTz = tdA.offsetHours === tdB.offsetHours;
    const coord = (c) => `${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'}, ${Math.abs(c.lon).toFixed(1)}° ${c.lon>=0?'E':'W'}`;

    let h = `<div class="cmp-title">${I.formatCityName(cityA)} ↔ ${I.formatCityName(cityB)}</div>`;
    h += `<div class="cmp-pair">
      <div class="cmp-card"><div class="cmp-card-name">${I.formatCityName(cityA)}</div><div class="cmp-card-time">${tdA.timeStr}</div><div class="cmp-card-tz">${tdA.offsetDisplay}</div><div class="cmp-card-coord">${coord(cityA)}</div></div>
      <div class="cmp-mid"><div>${diffH}h</div><div>${Math.round(dKm)}km</div><div>${sameDay?I.t('同天'):I.t('异天')}</div><div>${sameTz?I.t('同时区'):I.t('异时区')}</div></div>
      <div class="cmp-card"><div class="cmp-card-name">${I.formatCityName(cityB)}</div><div class="cmp-card-time">${tdB.timeStr}</div><div class="cmp-card-tz">${tdB.offsetDisplay}</div><div class="cmp-card-coord">${coord(cityB)}</div></div>
    </div>`;

    h += `<div class="wh-section"><h5>${I.t('工作时间')}</h5>
        <div class="wh-row">
          <span class="wh-city-tag">${I.formatCityName(cityA).replace(' ', '<br>')}<br><small style="font-size:0.625rem;color:var(--text-secondary);visibility:${W.i18n&&W.i18n.getCurrentLang()==='zh-CN'?'visible':'hidden'}">${cityA.name_en||''}</small></span>
          <input class="wh-input wh-a-start" data-pair="${i}-${j}" value="9" min="0" max="23.5" step="0.5">
          <span class="wh-sep">—</span>
          <input class="wh-input wh-a-end" data-pair="${i}-${j}" value="17" min="0.5" max="24" step="0.5">
        </div>
        <div class="wh-row">
          <span class="wh-city-tag">${I.formatCityName(cityB).replace(' ', '<br>')}<br><small style="font-size:0.625rem;color:var(--text-secondary);visibility:${W.i18n&&W.i18n.getCurrentLang()==='zh-CN'?'visible':'hidden'}">${cityB.name_en||''}</small></span>
          <input class="wh-input wh-b-start" data-pair="${i}-${j}" value="9" min="0" max="23.5" step="0.5">
          <span class="wh-sep">—</span>
          <input class="wh-input wh-b-end" data-pair="${i}-${j}" value="17" min="0.5" max="24" step="0.5">
        </div>
        <div class="wh-row"><button class="wh-calc-btn" data-pair="${i}-${j}">${I.t('计算')}</button></div>
        <div id="whResult-${i}-${j}"></div>
      </div>`;
    return h;
  }

  function buildOverlapResult(cityA, cityB, over, whA, whB) {
    const overlapHTML = over.hours > 0
      ? `<span class="overlap-badge good">${I.t('重叠')} ${over.hours}h</span>
          <div class="overlap-cards">
            <div class="overlap-card"><div class="oc-name">${I.formatCityName(cityA)}</div><div class="oc-time">${fmtHour(over.oStart)} — ${fmtHour(over.oEnd)}</div></div>
            <div class="overlap-card"><div class="oc-name">${I.formatCityName(cityB)}</div><div class="oc-time">${fmtHour(over.oStart - over.shift)} — ${fmtHour(over.oEnd - over.shift)}</div></div>
          </div>`
      : '<span class="overlap-badge none">' + W._('无重叠') + '</span>';
    return overlapHTML + buildTimeline(cityA, cityB, whA, whB);
    function fmtHour(v) { const h = (v % 24 + 24) % 24; return Math.floor(h) + ':' + (h % 1 === 0.5 ? '30' : '00'); }
  }

  function buildTimeline(cityA, cityB, whA, whB, refMode) {
    refMode = refMode || 'utc';
    const offA = W.Clock.getTimeData(cityA.timezone).offsetHours;
    const offB = W.Clock.getTimeData(cityB.timezone).offsetHours;
    // Time shift for reference mode (default UTC=0)
    // 公式: position = localTime - offset + refShift 已内置偏移
    // 所以坐标轴标签直接用位置 h 即可，不再追加 refShift
    const refShift = refMode === 'cityA' ? offA : (refMode === 'cityB' ? offB : 0);

    // Work hours in chosen time reference 0-24 axis
    const aStart = (whA[0] - offA + refShift + 48) % 24;
    const aEnd   = (whA[1] - offA + refShift + 48) % 24;
    const bStart = (whB[0] - offB + refShift + 48) % 24;
    const bEnd   = (whB[1] - offB + refShift + 48) % 24;

    // Render bar segments (handles midnight crossing by splitting [start,end] that wraps around 0)
    function bar(start, end, color) {
      let segs = [];
      if (start <= end) {
        segs = [{l: start / 24 * 100, w: (end - start) / 24 * 100}];
      } else {
        segs = [
          {l: 0, w: end / 24 * 100},
          {l: start / 24 * 100, w: (24 - start) / 24 * 100}
        ];
      }
      return segs.map(s =>
        `<div style="position:absolute;left:${s.l.toFixed(1)}%;width:${s.w.toFixed(1)}%;top:0;bottom:0;background:${color};opacity:0.6;border-radius:3px"></div>`
      ).join('');
    }

    // Overlap highlights (0.5h blocks)
    function overlapSegments() {
      let segs = '';
      for (let h = 0; h < 24; h += 0.5) {
        const t = h;
        const inA = aStart < aEnd ? (t >= aStart && t < aEnd) : (t >= aStart || t < aEnd);
        const inB = bStart < bEnd ? (t >= bStart && t < bEnd) : (t >= bStart || t < bEnd);
        if (inA && inB) {
          segs += `<div style="position:absolute;left:${(h/24*100).toFixed(1)}%;width:${(0.5/24*100).toFixed(1)}%;top:0;bottom:0;background:rgba(255,255,255,0.5);border-radius:3px;border:1px solid rgba(255,255,255,0.3)"></div>`;
        }
      }
      return segs;
    }

    const markers = [0,3,6,9,12,15,18,21].map(h =>
      `<span style="position:absolute;left:${(h/24*100).toFixed(1)}%;top:100%;transform:translateX(-50%);font-size:10px;color:var(--text-secondary);margin-top:2px">${h}:00</span>`
    ).join('');

    // Format work hours display
    const fmtHH = v => { const h = (v % 24 + 24) % 24; return Math.floor(h)+':'+((v%1===0.5)?'30':'00'); };

    return `<div class="timeline-section">
      <h4 class="timeline-title">${W._('时间轴')}</h4>
      <div class="timeline-city-label">${I.formatCityName(cityA)} (${fmtHH(whA[0])}–${fmtHH(whA[1])})</div>
      <div class="timeline-row">
        <div class="timeline-bar" style="position:relative;height:1.5rem;background:var(--bg-secondary);border-radius:6px;margin:4px 0">
          ${bar(aStart, aEnd, '#5b9bd5')}
          ${overlapSegments()}
          ${markers}
        </div>
      </div>
      <div class="timeline-city-label">${I.formatCityName(cityB)} (${fmtHH(whB[0])}–${fmtHH(whB[1])})</div>
      <div class="timeline-row">
        <div class="timeline-bar" style="position:relative;height:1.5rem;background:var(--bg-secondary);border-radius:6px;margin:4px 0">
          ${bar(bStart, bEnd, '#ed7d31')}
          ${overlapSegments()}
          ${markers}
        </div>
      </div>
      <div class="timeline-legend">
        <span><span class="tl-dot" style="background:#5b9bd5"></span> ${I.formatCityName(cityA)}</span>
        <span><span class="tl-dot" style="background:#ed7d31"></span> ${I.formatCityName(cityB)}</span>
      </div>
      <div class="timeline-ref">
        <span class="tl-ref-label">${W._('时间基准')}:</span>
        <select class="tl-ref-select" onchange="(()=>{let e=this.closest('.timeline-section');e.outerHTML=WorldClock.Compare.renderTimeline('${cityA.name}','${cityB.name}',${whA[0]},${whA[1]},${whB[0]},${whB[1]},this.value);})()">
          <option value="utc" ${refMode==='utc'?'selected':''}>UTC+0</option>
          <option value="cityA" ${refMode==='cityA'?'selected':''}>${I.formatCityName(cityA)}</option>
          <option value="cityB" ${refMode==='cityB'?'selected':''}>${I.formatCityName(cityB)}</option>
        </select>
      </div>
    </div>`;
  }

  function renderTimeline(nameA, nameB, wa0, wa1, wb0, wb1, refMode) {
    const cityA = window.WorldClock.getCityByName(nameA);
    const cityB = window.WorldClock.getCityByName(nameB);
    if (!cityA || !cityB) return '';
    return buildTimeline(cityA, cityB, [wa0, wa1], [wb0, wb1], refMode);
  }


  function workOverlapCustom(tzA, tzB, aStart, aEnd, bStart, bEnd) {
    const oA = C.getTimeData(tzA).offsetHours;
    const oB = C.getTimeData(tzB).offsetHours;
    const shift = oA - oB;
    let bsA = bStart + shift, beA = bEnd + shift;
    if (aStart >= aEnd) aEnd += 24;
    if (bsA >= beA) beA += 24;
    const oStart = Math.max(aStart, bsA);
    const oEnd = Math.min(aEnd, beA);
    return { hours: Math.max(0, oEnd - oStart), shift, oStart: oStart % 24, oEnd: oEnd % 24 };
  }

  W.Compare = { open: openCityCompare, close: closeCityCompare, setup: setupCmpSearch, renderTimeline };
})();
