/**
 * globe.js — Three.js 3D 地球模块
 * 
 * 特性:
 * - 球体渲染，使用自定义 shader 实现晨昏线
 * - 陆地从 GeoJSON 渲染为线条
 * - 太阳位置从 suncalc 获取
 * - 城市 3D 标记点
 * - 触控/鼠标旋转、缩放
 * - 地图颜色不受主题影响
 */
(function () {
  'use strict';
  const W = window.WorldClock = window.WorldClock || {};

  // 球体半径
  const R = 2.0;
  const R_SURFACE = 2.005; // 表面元素偏移，避免 Z-fighting
  // 城市标记半径(世界坐标)
  const MARKER_R = 0.018;
  const MARKER_R_SEL = 0.042;

  let containerEl, renderer, scene, camera, globeGroup;
  let sphere, sphereMat, sunUniforms;
  let landLines, cityGroup;
  let isDragging = false, dragPrev = { x: 0, y: 0 };
  let rotationVelocity = { x: 0, y: 0 };
  let autoRotate = true;
  let lastActivity = 0;
  let isFocusAnim = false; // 聚焦动画进行中
  let paused = false;      // 面板打开时冻结渲染
  let sel1 = null, sel2 = null;
  let onMarkerClick = null;
  let cityData3D = null;
  let fpsCap = 30;         // 0 = 不限制
  // Bresenham FPS pacing (长期平均精确 = fpsCap, 短期因 rAF 整数帧跳动)
  let _rafRate = 60;        // 测量到的 rAF 实际帧率, 默认 60
  let _rafCount = 0;        // 当前秒 rAF 帧数
  let _rafLastSec = 0;      // rAF 测量起始时间戳
  let _bresAccum = 0;       // Bresenham 累加器

  // Globe 实际渲染 FPS 追踪 (供 Dev 模块读取)
  let _trackFps = false;
  let _renderFrameCount = 0;
  let _renderLastTime = 0;
  let _renderFps = 0;
  let rafId;
  let tooltipEl, tooltipCity = null, tooltipTimer = null;
  const tooltipWorldPos = new THREE.Vector3();
  const tooltipScreen = new THREE.Vector3();


  /* ================================================================
   *  3D 坐标转换
   * ================================================================ */
  function latLngTo3D(lat, lng) {
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    return {
      x: R_SURFACE * Math.cos(latRad) * Math.cos(lngRad),
      y: R_SURFACE * Math.sin(latRad),
      z: -R_SURFACE * Math.cos(latRad) * Math.sin(lngRad)
    };
  }

  /* ================================================================
   *  着色器
   * ================================================================ */
  const VERTEX_SHADER = /* glsl */ `
    varying vec3 vLocalNormal;
    void main() {
      vLocalNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const FRAGMENT_SHADER = /* glsl */ `
    precision highp float;
    varying vec3 vLocalNormal;
    uniform vec3 uSunDir;

    void main() {
      vec3 N = normalize(vLocalNormal);
      vec3 L = normalize(uSunDir);
      float d = dot(N, L);

      // 大气折射：太阳在几何地平线下 ~0.3° 仍有微光
      float refrac = 0.005;

      float day = smoothstep(-0.1 - refrac, 0.1 - refrac, d);

      vec3 dayColor   = vec3(0.91, 0.92, 0.94);
      vec3 nightColor = vec3(0.12, 0.14, 0.22);
      vec3 twiColor   = vec3(0.25, 0.35, 0.55);

      float twi = exp(-(d + refrac) * (d + refrac) / 0.004);

      vec3 color = mix(nightColor, dayColor, day);
      color = mix(color, twiColor, twi * 0.45);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  /* ================================================================
   *  等待 THREE 就绪
   * ================================================================ */
  let THREE_READY = null;
  function ensureThree() {
    if (THREE_READY) return THREE_READY;
    if (window.THREE) {
      THREE_READY = Promise.resolve(window.THREE);
      return THREE_READY;
    }
    THREE_READY = new Promise((resolve, reject) => {
      const maxWait = 10000;
      const start = Date.now();
      const check = () => {
        if (window.THREE) return resolve(window.THREE);
        if (Date.now() - start > maxWait) return reject(new Error('THREE 加载超时'));
        setTimeout(check, 50);
      };
      check();
    });
    return THREE_READY;
  }

  /* ================================================================
   *  初始化
   * ================================================================ */
  async function init(container, opts) {
    const THREE = await ensureThree();
    containerEl = container;
    if (opts.onMarkerClick) onMarkerClick = opts.onMarkerClick;
    if (opts.sel1) sel1 = opts.sel1;
    if (opts.sel2) sel2 = opts.sel2;

    // 检查 WebGL 可用性，不可用时优雅降级
    if (!THREE || !THREE.WebGLRenderer) {
      console.warn('[Globe] THREE.js 未加载，跳过 3D 渲染');
      return;
    }

    const W = containerEl.clientWidth || 400;
    const H = containerEl.clientHeight || 400;

    // Renderer — graceful fallback on WebGL failure
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, failIfMajorPerformanceCaveat: false });
    } catch(e) {
      console.error('[Globe] WebGL 不可用，跳过 3D 渲染');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(W, H);
    renderer.setClearColor(0xc8d0d8, 1);
    // 触屏：阻止浏览器默认手势（滚动/缩放/长按菜单）
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.opacity = '1'; // 确保初始可见
    containerEl.appendChild(renderer.domElement);

    // WebGL 上下文丢失恢复
    renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      paused = true;
      console.warn('[Globe] WebGL context lost, paused');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      paused = false;
      console.log('[Globe] WebGL context restored');
    });

    // Scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 20);
    camera.position.set(0, 0.15, 9.5);
    camera.lookAt(0, 0, 0);

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ---- 城市信息悬浮 Tooltip ----
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'globe-tooltip';
    tooltipEl.style.cssText = 'display:none;position:fixed;z-index:9999;pointer-events:none;background:rgba(193,102,91,0.92);color:#fff;border-radius:10px;padding:8px 14px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:12px;line-height:1.5;text-align:center;min-width:100px;box-shadow:0 4px 16px rgba(0,0,0,0.25);';
    (containerEl || document.body).appendChild(tooltipEl);

    // ---- 球体 (shader 晨昏线) ----
    sunUniforms = { uSunDir: { value: new THREE.Vector3(1, 0, 0) } };
    sphereMat = new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    const sphereGeo = new THREE.SphereGeometry(R, 80, 40);
    sphere = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphere);

    // ---- 加载陆地线条 ----
    await loadLandLines();

    // ---- 加载城市标记 ----
    cityGroup = new THREE.Group();
    globeGroup.add(cityGroup);
    await loadCityMarkers();
    renderMarkers();

    // ---- 更新太阳位置 ----
    updateSun();

    // ---- 事件 ----
    bindEvents();

    // ---- 渲染循环 ----
    startLoop();

    // Android WebView 冷启动时 Canvas 可能未就绪，延迟强制渲染
    requestAnimationFrame(() => requestAnimationFrame(() => forceRender()));

    return { setSelected, renderMarkers, resize };
  }


  /* ================================================================
   *  加载陆地 (GeoJSON → 球面线条)
   * ================================================================ */
  async function loadLandLines() {
    try {
      const resp = await fetch('data/ne_50m_land.topojson');
      const topo = await resp.json();
      const geojson = topojson.feature(topo, topo.objects.land);
      const lineGroup = new THREE.Group();
      const allRings = []; // 收集原始坐标供 mini-globe 复用

      (geojson.features || []).forEach(feature => {
        const geom = feature.geometry;
        if (!geom) return;
        const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];

        polys.forEach(poly => {
          // 外环
          const ring = poly[0];
          if (!ring || ring.length < 3) return;
          allRings.push(ring); // 保存原始 [lon, lat]
          const pts = [];
          for (const [lng, lat] of ring) {
            const p = latLngTo3D(lat, lng);
            pts.push(p.x, p.y, p.z);
          }
          const lineGeo = new THREE.BufferGeometry();
          lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          const line = new THREE.Line(lineGeo,
            new THREE.LineBasicMaterial({ color: 0x4a8c5a, transparent: true, opacity: 0.50, depthTest: true })
          );
          lineGroup.add(line);
        });
      });

      if (landLines) globeGroup.remove(landLines);
      landLines = lineGroup;
      globeGroup.add(landLines);
      // 共享给 mini-globe 复用
      W._landRings = allRings;
      console.log('[Globe] 陆地线条加载完成');
    } catch (e) {
      console.warn('[Globe] 陆地加载失败，回退到纯色球体:', e.message);
    }
  }

  /* ================================================================
   *  城市标记
   * ================================================================ */
  async function loadCityMarkers() {
    if (cityData3D) return;
    try {
      const resp = await fetch('data/city-3d-coords.json');
      cityData3D = await resp.json();
    } catch (e) {
      console.warn('[Globe] 城市坐标加载失败:', e.message);
      cityData3D = {};
    }
  }

  function renderMarkers() {
    if (!cityData3D || !cityGroup) return;
    // 清除旧标记
    while (cityGroup.children.length) cityGroup.remove(cityGroup.children[0]);

    const selNames = new Set([sel1, sel2].filter(Boolean));

    for (const [name, pos] of Object.entries(cityData3D)) {
      const isSel = selNames.has(name);
      const r = isSel ? MARKER_R_SEL : MARKER_R;

      const dotGeo = new THREE.SphereGeometry(r, 6, 4);
      const dotMat = new THREE.MeshBasicMaterial({
        color: isSel ? 0xC1665B : 0xC1665B,
        transparent: !isSel,
        opacity: isSel ? 1.0 : 0.55,
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(pos.x, pos.y, pos.z);
      dot.userData = { cityName: name, isSelected: isSel };
      cityGroup.add(dot);
    }
  }

  function setSelected(s1, s2) {
    sel1 = s1; sel2 = s2;
    renderMarkers();
  }

  /* ================================================================
   *  聚焦城市 (平滑动画 800ms)
   * ================================================================ */
  function focusCity(name) {
    if (!cityData3D || !cityData3D[name]) return;
    const target = cityData3D[name];

    const x = target.x, y = target.y, z = target.z;
    const r = Math.sqrt(x*x + y*y + z*z);

    let targetY = Math.atan2(-x, z);
    let targetX = Math.asin(y / r);

    const cy = globeGroup.rotation.y % (Math.PI * 2);
    const cx = globeGroup.rotation.x;
    targetY = cy + shortestAngleDiff(cy, targetY);
    targetX = cx + shortestAngleDiff(cx, targetX);

    const rotX0 = cx, rotY0 = cy;
    const start = performance.now();
    const duration = 800;
    autoRotate = false;
    isFocusAnim = true;
    setTimeout(() => { isFocusAnim = false; }, 2000); // safety timeout

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
      globeGroup.rotation.x = rotX0 + (targetX - rotX0) * ease;
      globeGroup.rotation.y = rotY0 + (targetY - rotY0) * ease;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        isFocusAnim = false;
        // 动画结束：显示城市 tooltip
        showTooltipForCity(name);
      }
    }
    requestAnimationFrame(step);
  }

  function showTooltipForCity(name) {
    if (!cityData3D || !cityData3D[name]) return;
    const pos = cityData3D[name];
    const rect = containerEl ? containerEl.getBoundingClientRect() : renderer.domElement.getBoundingClientRect();
    tooltipWorldPos.set(pos.x, pos.y, pos.z);
    globeGroup.localToWorld(tooltipWorldPos);
    tooltipScreen.copy(tooltipWorldPos).project(camera);
    if (tooltipScreen.z < -1 || tooltipScreen.z > 1) return;
    const cx = (tooltipScreen.x * 0.5 + 0.5) * rect.width + rect.left;
    const cy = (-tooltipScreen.y * 0.5 + 0.5) * rect.height + rect.top;
    showCityTooltip(name, cx, cy, rect, 6000);
  }

  function shortestAngleDiff(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* ================================================================
   *  太阳位置更新
   * ================================================================ */
  function updateSun() {
    const sp = W.Astro.getSunPosition(new Date());
    const dir = W.Astro.sunPosTo3D(sp.declination, sp.ssLng);
    sunUniforms.uSunDir.value.set(dir.x, dir.y, dir.z);
    if (sphereMat) sphereMat.uniformsNeedUpdate = true;
  }

  /* ================================================================
   *  城市 Tooltip
   * ================================================================ */

  function showCityTooltip(name, cx, cy, rect, keepMs) {
    const W = window.WorldClock;
    const cities = W.CITIES;
    const city = cities.find(c => c.name === name);
    if (!city) return;

    const Clock = W.Clock;
    const td = Clock ? Clock.getTimeData(city.timezone) : null;
    const i18n = W.i18n;
    const cityName = i18n ? i18n.formatCityName(city) : (city.name + ' ' + (city.name_en||''));
    const countryName = i18n ? i18n.formatCountryName(city) : (city.country + ' · ' + (city.country_en||''));

    tooltipEl.innerHTML = [
      `<div style="font-weight:700;font-size:14px;margin-bottom:2px">${cityName}</div>`,
      `<div style="font-size:11px;opacity:0.85;margin-bottom:6px">${countryName}</div>`,
      td ? `<div style="font-size:20px;font-weight:300;font-family:monospace;margin-bottom:2px">${td.timeStr}</div>` : '',
      td ? `<div style="font-size:11px;opacity:0.8">${td.offsetDisplay}</div>` : '',
    ].join('');

    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (cx + 16) + 'px';
    tooltipEl.style.top = (cy - 10) + 'px';
    tooltipEl.style.opacity = '1';
    tooltipEl.style.transition = 'opacity 0s';
    tooltipCity = name;

    // 清除之前的定时器
    if (tooltipTimer) clearTimeout(tooltipTimer);
    // 2 秒后开始消失，耗时 1 秒
    tooltipTimer = setTimeout(() => {
      tooltipEl.style.transition = 'opacity 1s';
      tooltipEl.style.opacity = '0';
      tooltipTimer = setTimeout(() => {
        tooltipEl.style.display = 'none';
        tooltipCity = null;
      }, 1000);
    }, keepMs || 2000);
  }

  function hideTooltip() {
    if (tooltipTimer) clearTimeout(tooltipTimer);
    if (tooltipEl) { tooltipEl.style.display = 'none'; tooltipEl.style.opacity = '0'; }
    tooltipCity = null;
  }

  function updateTooltipPosition() {
    if (!tooltipCity || !cityData3D) return;
    const pos = cityData3D[tooltipCity];
    if (!pos) { tooltipEl.style.display = 'none'; return; }

    const rect = renderer.domElement.getBoundingClientRect();
    tooltipWorldPos.set(pos.x, pos.y, pos.z);
    globeGroup.localToWorld(tooltipWorldPos);
    tooltipScreen.copy(tooltipWorldPos).project(camera);

    if (tooltipScreen.z < -1 || tooltipScreen.z > 1) {
      tooltipEl.style.display = 'none';
      return;
    }

    const toCam = camera.position.clone().sub(tooltipWorldPos).normalize();
    const out = tooltipWorldPos.clone().normalize();
    if (toCam.dot(out) < 0) {
      tooltipEl.style.display = 'none';
      return;
    }

    const sx = (tooltipScreen.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-tooltipScreen.y * 0.5 + 0.5) * rect.height + rect.top;
    tooltipEl.style.left = (sx + 16) + 'px';
    tooltipEl.style.top = (sy - 10) + 'px';
  }

  let hasMoved = false; // 区分点击与拖拽 (鼠标+触屏)
  let isTouch = false;
  let mouseMoved = false; // 鼠标拖拽移动标记

  // ======== 触摸调试浮层 (开发用, W.Globe._debugTouch = true 开启) ========
  let _debugTouch = false;
  let _debugEl = null;
  let _debugBuf = [];
  let _debugLastFlush = 0;
  function _initDebug() {
    _debugEl = document.createElement('div');
    _debugEl.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;font:9px monospace;padding:4px 6px;max-height:40vh;overflow-y:auto;pointer-events:none;white-space:pre;line-height:1.2;max-width:95vw';
    document.body.appendChild(_debugEl);
  }
  function _flushDebug() {
    if (!_debugEl || !_debugBuf.length) return;
    _debugEl.textContent = _debugBuf.slice(-12).join('\n');
    _debugBuf = [];
  }
  function _debugTouchLog(e, type) {
    if (!_debugTouch) return;
    const ts = performance.now().toFixed(0);
    const line = `${type} t:${e.touches?.length || 0} c:${e.changedTouches?.length || 0} pS:${pinchStart?.toFixed(0) || 0} z:${camera?.position?.z?.toFixed(1) || '?'} @${ts}`;
    _debugBuf.push(line);
    // 节流刷新：每 200ms 更新一次 DOM
    const now = performance.now();
    if (now - _debugLastFlush > 200) { _flushDebug(); _debugLastFlush = now; }
  }

  // comet 暂停/恢复
  const _cometEl = document.getElementById('comet-el');
  let _cometTimer = null;
  function _pauseComet() {
    if (_cometEl) { _cometEl.style.animationPlayState = 'paused'; _cometEl.style.display = 'none'; }
    if (_cometTimer) clearTimeout(_cometTimer);
  }
  function _resumeComet() {
    _cometTimer = setTimeout(() => {
      if (_cometEl) { _cometEl.style.display = ''; _cometEl.style.animationPlayState = 'running'; }
    }, 1500);
  }

  function bindEvents() {
    const el = renderer.domElement;
    let pinchStart = 0;
    let pinchCamZ = 0;
    let _savedFpsCap = 30; // 交互时暂存帧率上限

    // ======== Pointer Events (替代 touch, 兼容三星延迟双指) ========
    const pointers = new Map(); // pointerId → {x, y}

    function _ptrCount() { return pointers.size; }
    function _ptrPositions() {
      const pts = [...pointers.values()];
      return pts.length >= 2 ? { a: pts[0], b: pts[1] } : null;
    }

    el.addEventListener('pointerdown', e => {
      e.preventDefault();  // 阻止 Android 系统手势, 确保后续 pointermove 到达
      _pauseComet();
      if (_ptrCount() === 0) { _savedFpsCap = fpsCap; fpsCap = 0; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const n = _ptrCount();
      if (n === 1) {
        isTouch = e.pointerType === 'touch';
        hasMoved = false;
        mouseMoved = false;
        isDragging = true;
        dragPrev = { x: e.clientX, y: e.clientY };
        rotationVelocity = { x: 0, y: 0 };
        autoRotate = false;
        lastActivity = Date.now();
      } else if (n === 2) {
        hasMoved = true;
        isDragging = false;
        const p = _ptrPositions();
        const dx = p.a.x - p.b.x;
        const dy = p.a.y - p.b.y;
        pinchStart = Math.sqrt(dx * dx + dy * dy);
        pinchCamZ = camera.position.z;
      }
    });

    el.addEventListener('pointermove', e => {
      e.preventDefault();
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      const n = _ptrCount();
      if (n >= 2) {
        hasMoved = true;
        isDragging = false;
        const pts = _ptrPositions();
        if (!pts) return;
        const dx = pts.a.x - pts.b.x;
        const dy = pts.a.y - pts.b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (!pinchStart || pinchStart <= 0) {
          pinchStart = dist;
          pinchCamZ = camera.position.z;
        } else {
          camera.position.z = pinchCamZ * (pinchStart / dist);
          camera.position.z = Math.max(3.5, Math.min(18, camera.position.z));
        }
      } else if (n === 1 && isDragging) {
        const dx = e.clientX - dragPrev.x;
        const dy = e.clientY - dragPrev.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) hasMoved = true;
        globeGroup.rotation.y += dx * 0.006;
        globeGroup.rotation.x += dy * 0.006;
        globeGroup.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, globeGroup.rotation.x));
        rotationVelocity = { x: dy * 0.006, y: dx * 0.006 };
        dragPrev = { x: e.clientX, y: e.clientY };
      }
    });

    el.addEventListener('pointerup', e => {
      pointers.delete(e.pointerId);
      if (_ptrCount() === 0) {
        isDragging = false;
        pinchStart = 0;
        fpsCap = _savedFpsCap;  // 恢复帧率限制
        _resumeComet();
      } else if (_ptrCount() === 1 && pinchStart > 0) {
        // 双指变单指：结束缩放，开始拖拽
        pinchStart = 0;
        const rem = pointers.values().next().value;
        if (rem) { dragPrev = { x: rem.x, y: rem.y }; isDragging = true; }
      }
    });

    el.addEventListener('pointercancel', e => {
      pointers.delete(e.pointerId);
      if (_ptrCount() === 0) { isDragging = false; pinchStart = 0; fpsCap = _savedFpsCap; _resumeComet(); }
    });

    // click 防误触
    el.addEventListener('click', e => {
      if (isTouch && hasMoved) {
        e.stopPropagation();
        e.preventDefault();
      }
      isTouch = false;
    }, true);

    // ---- 鼠标拖拽 ----
    el.addEventListener('mousedown', e => {
      _pauseComet();
      isDragging = true;
      mouseMoved = false;
      dragPrev = { x: e.clientX, y: e.clientY };
      rotationVelocity = { x: 0, y: 0 };
      autoRotate = false;
      lastActivity = Date.now();
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - dragPrev.x;
      const dy = e.clientY - dragPrev.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) mouseMoved = true;
      globeGroup.rotation.y += dx * 0.01;
      globeGroup.rotation.x += dy * 0.01;
      globeGroup.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globeGroup.rotation.x));
      rotationVelocity = { x: dy * 0.01, y: dx * 0.01 };
      dragPrev = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      _resumeComet();
    });

    // ---- 滚轮缩放 ----
    el.addEventListener('wheel', e => {
      e.preventDefault();
      _pauseComet();
      camera.position.z += e.deltaY * 0.01;
      camera.position.z = Math.max(3.5, Math.min(18, camera.position.z));
      _resumeComet();
    }, { passive: false });

    // ---- 点击城市 ----
    el.addEventListener('click', e => {
      // 跳过拖拽后的误触：鼠标拖过 / 触屏拖过 / 惯性旋转中
      if (mouseMoved || (isTouch && hasMoved)) return;
      if (Math.abs(rotationVelocity.x) > 0.002 || Math.abs(rotationVelocity.y) > 0.002) return;
      mouseMoved = false;
      isTouch = false;

      const rect = el.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const threshold = 32; // 屏幕像素命中范围

      // 将每个城市的 3D 坐标投影到屏幕，取距离最近者
      let bestDist = Infinity;
      let bestName = null;
      const screenVec = new THREE.Vector3();

      for (const [name, pos] of Object.entries(cityData3D)) {
        const worldPos = new THREE.Vector3(pos.x, pos.y, pos.z);
        globeGroup.localToWorld(worldPos);
        screenVec.copy(worldPos).project(camera);

        // 只考虑可见点（NDC z 在 -1..1 范围内）
        if (screenVec.z < -1 || screenVec.z > 1) continue;

        // 只考虑朝向摄像机的点（点在球正面）
        const toCamera = camera.position.clone().sub(worldPos).normalize();
        const outward = worldPos.clone().normalize();
        if (toCamera.dot(outward) < 0) continue;

        const sx = (screenVec.x * 0.5 + 0.5) * rect.width;
        const sy = (-screenVec.y * 0.5 + 0.5) * rect.height;

        const dist = Math.hypot(sx - clickX, sy - clickY);
        if (dist < threshold && dist < bestDist) {
          bestDist = dist;
          bestName = name;
        }
      }

      if (bestName && onMarkerClick) {
        onMarkerClick(bestName);
        // 显示城市详情 Tooltip
        showCityTooltip(bestName, clickX, clickY, rect);
      } else {
        tooltipEl.style.display = 'none';
      }
    });

    // ---- 双击重置 ----
    el.addEventListener('dblclick', () => {
      globeGroup.rotation.set(0, 0, 0);
      camera.position.set(0, 0.15, 9.5);
      autoRotate = true;
      tooltipEl.style.display = 'none';
    });

    // ---- 窗口大小变化 ----
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!containerEl || !renderer) return;
    const W = containerEl.clientWidth;
    const H = containerEl.clientHeight;
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  /* ================================================================
   *  渲染循环
   * ================================================================ */
  function startLoop() {
    let lastSunUpdate = 0;
    let lastActivity = 0;
    let lastW = 0, lastH = 0;

    fpsCap = 30;  // 重置限制
    _rafLastSec = 0;
    _rafCount = 0;
    _bresAccum = 0;

    const IDLE_PAUSE = 3000;

    function animate(timestamp) {
      if (paused) { rafId = requestAnimationFrame(animate); return; }
      rafId = requestAnimationFrame(animate);

      // 自动检测容器尺寸变化（修复 WebView 冷启动 Canvas 0x0 问题）
      if (containerEl && (containerEl.clientWidth !== lastW || containerEl.clientHeight !== lastH)) {
        lastW = containerEl.clientWidth;
        lastH = containerEl.clientHeight;
        if (lastW > 0 && lastH > 0) resize();
      }

      const now = Date.now();
      const moving = isDragging || Math.abs(rotationVelocity.x) > 0.0005 || Math.abs(rotationVelocity.y) > 0.0005;
      const hasTooltip = !!tooltipCity;
      const idle = !moving && !autoRotate && !hasTooltip && !isFocusAnim;

      // ======== 始终测量 rAF 实际帧率（独立于 FPS 限制）========
      if (!_rafLastSec) _rafLastSec = timestamp;
      _rafCount++;
      if (timestamp - _rafLastSec >= 1000) {
        _rafRate = _rafCount;
        _rafCount = 0;
        _rafLastSec = timestamp;
      }

      // FPS 限制 — Bresenham 帧分配 (长期平均精确 = fpsCap)
      if (fpsCap > 0) {
        _bresAccum += fpsCap;
        if (_bresAccum < _rafRate) return;
        _bresAccum -= _rafRate;
      }

      // 空闲 3 秒后停止自动旋转
      if (!moving) {
        if (now - lastActivity > IDLE_PAUSE) {
          autoRotate = false;
        }
      } else {
        lastActivity = now;
        autoRotate = true;
      }

      // 旋转
      if (!isDragging && autoRotate) {
        globeGroup.rotation.y += 0.001;
      } else if (!isDragging) {
        globeGroup.rotation.y += rotationVelocity.y * 0.95;
        globeGroup.rotation.x += rotationVelocity.x * 0.95;
        rotationVelocity.x *= 0.95;
        rotationVelocity.y *= 0.95;
      }

      // 完全静止且无 tooltip 时跳过渲染太阳更新外的帧
      if (idle && now - lastSunUpdate < 300000) return;

      // 太阳更新
      if (now - lastSunUpdate > 300000) {
        updateSun();
        lastSunUpdate = now;
      }

      if (hasTooltip) updateTooltipPosition();
      renderer.render(scene, camera);
      // 实际渲染 FPS 计数
      if (_trackFps) {
        _renderFrameCount++;
        const t = performance.now();
        if (t - _renderLastTime >= 1000) {
          _renderFps = Math.round(_renderFrameCount * 1000 / (t - _renderLastTime));
          _renderFrameCount = 0;
          _renderLastTime = t;
        }
      }
    }
    requestAnimationFrame(animate);
  }

  /* ================================================================
   *  公开 API
   * ================================================================ */
  function forceRender() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
  }

  // 三星平板恢复: EGL 上下文丢失不触发 webglcontextlost, 需手动重建 sphere
  function rebuildSphere() {
    if (!globeGroup || R == null) return;
    // 移除旧球体
    if (sphere) { globeGroup.remove(sphere); sphere.geometry.dispose(); sphere.material.dispose(); }
    // 重建
    sunUniforms = { uSunDir: { value: new THREE.Vector3(1, 0, 0) } };
    sphereMat = new THREE.ShaderMaterial({
      uniforms: sunUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    sphere = new THREE.Mesh(new THREE.SphereGeometry(2.005, 80, 40), sphereMat);
    globeGroup.add(sphere);
    updateSun();
  }

  // 页面可见性 → 后台时暂停渲染
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      paused = false;
      forceRender();
    } else {
      paused = true;
    }
  });

  // Capacitor Android 生命周期：真正的后台 / 返回前台
  // 分屏和小窗不会触发 pause，visibilityState 保持 'visible'
  try {
    const cv = window.Capacitor || (window.Capacitor = {});
    // 兼容 Capacitor 5.x 和 6.x 的插件 API
    const App = cv.Plugins?.App || cv.getPlatform?.() === 'web' ? null : null;
    if (App) {
      App.addListener('pause', () => { paused = true; });
      App.addListener('resume', () => { paused = false; rebuildSphere(); forceRender(); });
    }
  } catch(e) { /* 非 Capacitor 环境忽略 */ }

  function setFpsCap(val) { fpsCap = val > 0 ? val : 0; _bresAccum = 0; }

  W.Globe = {
    init,
    renderMarkers,
    setSelected,
    focusCity,
    resize,
    updateSun: () => updateSun(),
    forceRender,
    pause: () => { paused = true; if (renderer) renderer.domElement.style.opacity = '0'; },
    resume: () => { paused = false; if (renderer) { renderer.domElement.style.opacity = '1'; forceRender(); } },
    setFpsCap,
    trackFps: function(v) { _trackFps = v; if (v) { _renderFrameCount = 0; _renderLastTime = performance.now(); _renderFps = 0; } },
    getFps: function() { return _renderFps; },
    getFpsCap: function() { return fpsCap; },
    isPaused: function() { return paused; },
    hideTooltip: hideTooltip,
    rebuildSphere: rebuildSphere,
    _debugTouch: function(v) {
      _debugTouch = v;
      if (v && !_debugEl) _initDebug();
      if (!v && _debugEl) { _debugEl.remove(); _debugEl = null; _debugBuf = []; }
    }
  };

})();
