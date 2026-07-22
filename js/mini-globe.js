/**
 * mini-globe.js — 城市比较面板迷你 3D 地球 + 大圆红线路径
 * 支持拖拽旋转 + 滚轮缩放
 */
window.WorldClock = window.WorldClock || {};

(function() {
  'use strict';
  const W = window.WorldClock;

  let renderer, scene, camera, globeGroup, rafId;
  let targetRotX = 0, targetRotY = 0;
  let currentRotX = 0, currentRotY = 0;
  let isDragging = false, dragPrev = { x: 0, y: 0 };
  let pinchStart = 0, pinchCamZ = 3.5;
  let routeGroup = null;
  let labelA = null, labelB = null;
  let cityA_ref = null, cityB_ref = null;
  let THREE_ref = null; // 保存 THREE 引用

  // Mini Globe FPS 追踪
  let _mgTrackFps = false;
  let _mgFrameCount = 0;
  let _mgLastTime = 0;
  let _mgFps = 0;

  // Mini Globe Bresenham FPS 限制 (跟随主 globe 设置)
  let _mgRafRate = 60, _mgRafCount = 0, _mgRafLastSec = 0, _mgAccum = 0;

  async function init(container, cityA, cityB) {
    const THREE = W.THREE || window.THREE;
    if (!THREE) return;
    THREE_ref = THREE;
    const W2 = container.clientWidth || 300;
    const H2 = container.clientHeight || 300;

    if (renderer) {
      cancelAnimationFrame(rafId);
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      if (routeGroup) { globeGroup.remove(routeGroup); routeGroup = new THREE.Group(); globeGroup.add(routeGroup); }
    } else {
      container.innerHTML = '';
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      container.appendChild(renderer.domElement);
    }
    renderer.setSize(W2, H2);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.touchAction = 'none';

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, W2 / H2, 0.1, 10);
    camera.position.set(0, 0.1, 3.5);
    camera.lookAt(0, 0, 0);

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // 海洋球
    globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 80, 40),
      new THREE.MeshBasicMaterial({ color: 0xc8d0d8 })
    ));

    // 大陆线（复用主地球数据，省 469KB fetch）
    drawLand(THREE);

    // 大圆红线
    routeGroup = new THREE.Group();
    globeGroup.add(routeGroup);
    drawGreatCircle(THREE, cityA, cityB);

    // 居中
    centerOnPath(cityA, cityB);

    // 城市标签
    cityA_ref = cityA; cityB_ref = cityB;
    if (!labelA) {
      labelA = document.createElement('div');
      labelB = document.createElement('div');
      [labelA, labelB].forEach(l => {
        l.style.cssText = 'position:absolute;color:#fff;font-size:11px;font-weight:600;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.7);white-space:nowrap;transform:translate(-50%,-50%)';
        container.appendChild(l);
      });
    }
    const i18n = W.i18n;
    labelA.textContent = i18n ? i18n.formatCityName(cityA) : cityA.name;
    labelB.textContent = i18n ? i18n.formatCityName(cityB) : cityB.name;

    // 事件
    bindEvents(THREE, container);

    // 渲染（含标签更新 + FPS 限制）
    function animate(timestamp) {
      rafId = requestAnimationFrame(animate);

      // 跟随主 globe 的 FPS 限制 (Bresenham)
      const cap = W.Globe?.getFpsCap ? W.Globe.getFpsCap() : 0;
      if (cap > 0) {
        if (!_mgRafLastSec) _mgRafLastSec = timestamp;
        _mgRafCount++;
        if (timestamp - _mgRafLastSec >= 1000) {
          _mgRafRate = _mgRafCount;
          _mgRafCount = 0;
          _mgRafLastSec = timestamp;
        }
        _mgAccum += cap;
        if (_mgAccum < _mgRafRate) return;
        _mgAccum -= _mgRafRate;
      }

      currentRotX += (targetRotX - currentRotX) * 0.08;
      currentRotY += (targetRotY - currentRotY) * 0.08;
      globeGroup.rotation.x = currentRotX;
      globeGroup.rotation.y = currentRotY;
      renderer.render(scene, camera);
      updateLabels(container);
      // Mini Globe 渲染 FPS 计数
      if (_mgTrackFps) {
        _mgFrameCount++;
        const t = performance.now();
        if (t - _mgLastTime >= 1000) {
          _mgFps = Math.round(_mgFrameCount * 1000 / (t - _mgLastTime));
          _mgFrameCount = 0;
          _mgLastTime = t;
        }
      }
    }
    animate();
  }

  function drawLand(THREE) {
    const landGroup = new THREE.Group();
    const rings = W._landRings;
    if (!rings || !rings.length) return;

    rings.forEach(ring => {
      if (!ring || ring.length < 3) return;
      const pts = [];
      const step = Math.max(1, Math.floor(ring.length / 400));
      for (let i = 0; i < ring.length; i += step) {
        const [lon, lat] = ring[i];
        const phi = (90 - lat) * Math.PI / 180;
        const theta = lon * Math.PI / 180;
        pts.push(new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          -Math.sin(phi) * Math.sin(theta)
        ));
      }
      if (pts.length < 2) return;
      landGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x4a8c5a, transparent: true, opacity: 0.55 })
      ));
    });
    landGroup.scale.set(1.002, 1.002, 1.002);
    globeGroup.add(landGroup);
  }

  function drawGreatCircle(THREE, cityA, cityB) {
    routeGroup.clear();
    const R = 1.004;
    const lat1 = cityA.lat * Math.PI / 180, lon1 = cityA.lon * Math.PI / 180;
    const lat2 = cityB.lat * Math.PI / 180, lon2 = cityB.lon * Math.PI / 180;

    // 大圆总弧长
    const dLon = lon2 - lon1;
    const cosD = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const D = Math.acos(Math.max(-1, Math.min(1, cosD)));

    const pts = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      if (D < 0.001) {
        const phi = Math.PI/2 - lat1, theta = lon1;
        pts.push(new THREE.Vector3(R * Math.sin(phi) * Math.cos(theta), R * Math.cos(phi), -R * Math.sin(phi) * Math.sin(theta)));
        continue;
      }
      const a = Math.sin((1 - f) * D) / Math.sin(D);
      const b = Math.sin(f * D) / Math.sin(D);
      const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
      const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
      const z = a * Math.sin(lat1) + b * Math.sin(lat2);
      const n = Math.sqrt(x*x + y*y + z*z);
      pts.push(new THREE.Vector3(R * x / n, R * z / n, -R * y / n));
    }

    routeGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.9 })
    ));

    // 端点圆点
    [cityA, cityB].forEach(city => {
      const phi = (90 - city.lat) * Math.PI / 180;
      const theta = city.lon * Math.PI / 180;
      const pos = new THREE.Vector3(
        R * Math.sin(phi) * Math.cos(theta),
        R * Math.cos(phi),
        -R * Math.sin(phi) * Math.sin(theta)
      );
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
      dot.position.copy(pos);
      routeGroup.add(dot);
    });
  }

  function centerOnPath(cityA, cityB) {
    const lat1 = cityA.lat * Math.PI / 180, lon1 = cityA.lon * Math.PI / 180;
    const lat2 = cityB.lat * Math.PI / 180, lon2 = cityB.lon * Math.PI / 180;
    const cosD = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    const D = Math.acos(Math.max(-1, Math.min(1, cosD)));
    if (D < 0.001) { targetRotX = -lat1; targetRotY = lon1; return; }

    const si = Math.sin(D);
    const a = Math.sin(0.5 * D) / si;
    const b = Math.sin(0.5 * D) / si;
    const mx = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const my = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const mz = a * Math.sin(lat1) + b * Math.sin(lat2);
    const nm = Math.sqrt(mx*mx + my*my + mz*mz);

    // 使用 globe.js 一致的旋转公式
    const x = mx / nm, y = mz / nm, z = -my / nm;
    const r = Math.sqrt(x*x + y*y + z*z);
    targetRotX = Math.asin(y / r);
    targetRotY = Math.atan2(-x, z);
  }

  function bindEvents(THREE, container) {
    const el = renderer.domElement;

    // 鼠标拖拽
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      isDragging = true;
      dragPrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', e => {
      if (!isDragging || e.pointerType === 'touch') return;
      const dx = e.clientX - dragPrev.x;
      const dy = e.clientY - dragPrev.y;
      targetRotY += dx * 0.01;
      targetRotX += dy * 0.01;
      targetRotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotX));
      dragPrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => { isDragging = false; });

    // 触屏拖拽 + 缩放
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        dragPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        e.preventDefault();
      } else if (e.touches.length === 2) {
        isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStart = Math.sqrt(dx*dx + dy*dy);
        pinchCamZ = camera.position.z;
        e.preventDefault();
      }
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinchStart > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        camera.position.z = pinchCamZ * (pinchStart / dist);
        camera.position.z = Math.max(2.0, Math.min(6.0, camera.position.z));
        e.preventDefault();
        return;
      }
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragPrev.x;
      const dy = e.touches[0].clientY - dragPrev.y;
      targetRotY += dx * 0.01;
      targetRotX += dy * 0.01;
      targetRotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotX));
      dragPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchend', e => {
      isDragging = false;
      if (e.touches.length === 0) pinchStart = 0;
    });

    // 缩放
    el.addEventListener('wheel', e => {
      e.preventDefault();
      camera.position.z += e.deltaY * 0.005;
      camera.position.z = Math.max(2.0, Math.min(6.0, camera.position.z));
    }, { passive: false });
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    if (renderer) { renderer.dispose(); renderer = null; }
    if (labelA) { labelA.remove(); labelB.remove(); labelA = labelB = null; }
    scene = null; camera = null; globeGroup = null; routeGroup = null;
    _mgAccum = 0; _mgRafLastSec = 0; _mgRafCount = 0;
  }

  function updateLabels(container) {
    if (!labelA || !labelB || !cityA_ref || !cityB_ref || !THREE_ref) return;
    const THREE = THREE_ref;
    const rect = renderer.domElement.getBoundingClientRect();
    [cityA_ref, cityB_ref].forEach((city, idx) => {
      const label = idx === 0 ? labelA : labelB;
      const phi = (90 - city.lat) * Math.PI / 180;
      const theta = city.lon * Math.PI / 180;
      const pt = new THREE.Vector3(
        1.01 * Math.sin(phi) * Math.cos(theta),
        1.01 * Math.cos(phi),
        -1.01 * Math.sin(phi) * Math.sin(theta)
      );
      pt.applyQuaternion(globeGroup.quaternion).project(camera);
      const sx = (pt.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-pt.y * 0.5 + 0.5) * rect.height + rect.top;
      // 圆心和半径（CSS border-radius: 50% 裁剪范围）
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const cr = Math.min(rect.width, rect.height) / 2;
      const dx = sx - cx, dy = sy - cy;
      const inFront = pt.z < 1;
      const inCircle = dx * dx + dy * dy <= cr * cr * 0.95; // 5% margin
      label.style.left = sx + 'px';
      label.style.top = sy + 'px';
      label.style.display = (inFront && inCircle) ? 'block' : 'none';
    });
  }

  W.MiniGlobe = { init, destroy,
    trackFps: function(v) { _mgTrackFps = v; if (v) { _mgFrameCount = 0; _mgLastTime = performance.now(); _mgFps = 0; } },
    getFps: function() { return _mgFps; },
    isActive: function() { return !!renderer; }
  };
})();
