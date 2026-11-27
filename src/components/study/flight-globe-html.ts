/**
 * Globe.gl 기반 3D 지구본 + 실시간 비행 경로 HTML 생성기.
 * 모바일(react-native-webview)과 웹(iframe sandbox="allow-scripts")에서 동일한 HTML을 사용한다.
 */

export type FlightGlobeState = {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  codeFrom: string;
  codeTo: string;
  progress: number;
  arrived: boolean;
  running: boolean;
  routeId: string;
};

/** <script> 내부에 안전하게 삽입할 수 있도록 HTML 특수문자 및 줄 구분자를 이스케이프한다. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (ch) => {
    switch (ch) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return ch;
    }
  });
}

export function buildFlightGlobeHtml(initial: FlightGlobeState): string {
  const initialJson = safeJsonForScript(initial);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; img-src https://unpkg.com data: blob:; style-src 'unsafe-inline'; connect-src https://unpkg.com;" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #globeViz {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #060911;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .airport-tag {
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(9, 13, 24, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #F8FAFC;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.6px;
    white-space: nowrap;
    transform: translate(-50%, -140%);
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
  }
  .airport-tag.arrived {
    border-color: rgba(74, 222, 128, 0.7);
    color: #4ADE80;
  }
  .plane-marker {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }
  .plane-ring {
    position: absolute;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: rgba(96, 165, 250, 0.24);
    border: 1px solid rgba(147, 197, 253, 0.55);
  }
  .plane-ring.arrived {
    background: rgba(74, 222, 128, 0.24);
    border-color: rgba(74, 222, 128, 0.7);
  }
  .loading-text {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.45);
    font-size: 12px;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }
</style>
<script
  src="https://unpkg.com/globe.gl@2.43.0/dist/globe.gl.min.js"
  crossorigin="anonymous"
  onerror="window.__globeLoadFailed=true"></script>
</head>
<body>
<div id="globeViz"></div>
<div id="loading" class="loading-text">지구본 불러오는 중…</div>
<script>
(function () {
  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var currentState = ${initialJson};
  var lastRouteKey = null;
  var globe = null;
  var resizeObs = null;
  var initAttempts = 0;

  // 매 초마다 DOM/SVG 요소를 새로 만들지 않고 재사용한다.
  var fromTagEl = document.createElement('div');
  fromTagEl.className = 'airport-tag';

  var toTagEl = document.createElement('div');
  toTagEl.className = 'airport-tag';

  var planeWrapEl = document.createElement('div');
  planeWrapEl.className = 'plane-marker';
  var planeRingEl = document.createElement('div');
  planeRingEl.className = 'plane-ring';
  planeWrapEl.appendChild(planeRingEl);
  var planeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  planeSvgEl.setAttribute('width', '20');
  planeSvgEl.setAttribute('height', '20');
  planeSvgEl.setAttribute('viewBox', '0 0 24 24');
  var planePathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  planePathEl.setAttribute('d', 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z');
  planePathEl.setAttribute('fill', '#FFFFFF');
  planePathEl.setAttribute('stroke', '#060911');
  planePathEl.setAttribute('stroke-width', '0.7');
  planePathEl.setAttribute('stroke-linejoin', 'round');
  planeSvgEl.appendChild(planePathEl);
  planeWrapEl.appendChild(planeSvgEl);

  var markerItems = [
    { key: 'from', lat: 0, lng: 0, alt: 0.01 },
    { key: 'to', lat: 0, lng: 0, alt: 0.01 },
    { key: 'plane', lat: 0, lng: 0, alt: 0.02 }
  ];

  function getMarkerElement(d) {
    if (d.key === 'from') return fromTagEl;
    if (d.key === 'to') return toTagEl;
    return planeWrapEl;
  }

  function toVec(lat, lng) {
    var phi = lat * DEG;
    var lam = lng * DEG;
    return [
      Math.cos(phi) * Math.cos(lam),
      Math.cos(phi) * Math.sin(lam),
      Math.sin(phi)
    ];
  }

  function slerp(lat1, lng1, lat2, lng2, t) {
    var a = toVec(lat1, lng1);
    var b = toVec(lat2, lng2);
    var dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]));
    var omega = Math.acos(dot);
    if (omega < 1e-5) return { lat: lat1, lng: lng1 };
    var sinO = Math.sin(omega);
    var w1 = Math.sin((1 - t) * omega) / sinO;
    var w2 = Math.sin(t * omega) / sinO;
    var x = w1 * a[0] + w2 * b[0];
    var y = w1 * a[1] + w2 * b[1];
    var z = w1 * a[2] + w2 * b[2];
    return {
      lat: Math.atan2(z, Math.sqrt(x*x + y*y)) * RAD,
      lng: Math.atan2(y, x) * RAD
    };
  }

  function bearing(lat1, lng1, lat2, lng2) {
    var p1 = lat1 * DEG;
    var p2 = lat2 * DEG;
    var dl = (lng2 - lng1) * DEG;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * RAD + 360) % 360;
  }

  function angularDistanceDeg(lat1, lng1, lat2, lng2) {
    var a = toVec(lat1, lng1);
    var b = toVec(lat2, lng2);
    var dot = Math.max(-1, Math.min(1, a[0]*b[0] + a[1]*b[1] + a[2]*b[2]));
    return Math.acos(dot) * RAD;
  }

  function routeView(st) {
    var mid = slerp(st.fromLat, st.fromLng, st.toLat, st.toLng, 0.5);
    var distDeg = angularDistanceDeg(st.fromLat, st.fromLng, st.toLat, st.toLng);
    var altitude = Math.max(0.42, Math.min(1.95, distDeg * 0.024 + 0.34));
    return { lat: mid.lat, lng: mid.lng, altitude: altitude };
  }

  function renderState(st, focusCamera) {
    if (!st || typeof st !== 'object') return;
    currentState = st;
    if (!globe) return;

    var t = Math.max(0, Math.min(1, Number(st.progress) || 0));
    var fromLat = Number(st.fromLat) || 0;
    var fromLng = Number(st.fromLng) || 0;
    var toLat = Number(st.toLat) || 0;
    var toLng = Number(st.toLng) || 0;
    var arrived = Boolean(st.arrived);

    var distDeg = angularDistanceDeg(fromLat, fromLng, toLat, toLng);
    var arcAlt = Math.max(0.05, Math.min(0.28, distDeg * 0.0032));
    var planePos = slerp(fromLat, fromLng, toLat, toLng, t);
    var nextPos = slerp(fromLat, fromLng, toLat, toLng, Math.min(1, t + 0.02));
    var prevPos = slerp(fromLat, fromLng, toLat, toLng, Math.max(0, t - 0.02));
    var heading = t < 0.98
      ? bearing(planePos.lat, planePos.lng, nextPos.lat, nextPos.lng)
      : bearing(prevPos.lat, prevPos.lng, planePos.lat, planePos.lng);
    var planeAlt = Math.sin(Math.PI * t) * arcAlt + 0.015;
    var activeColor = arrived ? '#4ADE80' : '#60A5FA';

    var arcs = [
      {
        startLat: fromLat,
        startLng: fromLng,
        endLat: toLat,
        endLng: toLng,
        color: ['rgba(255,255,255,0.36)', 'rgba(255,255,255,0.36)'],
        altitude: arcAlt,
        stroke: 0.75,
        dashLen: 1,
        dashGap: 0,
        dashAnim: 0
      }
    ];

    if (t > 0.005) {
      arcs.push({
        startLat: fromLat,
        startLng: fromLng,
        endLat: planePos.lat,
        endLng: planePos.lng,
        color: [activeColor, activeColor],
        altitude: arcAlt * Math.sin(Math.PI * Math.min(0.5, t)),
        stroke: 1.25,
        dashLen: 1,
        dashGap: 0,
        dashAnim: 0
      });
    }

    globe.arcsData(arcs);

    var routeKey = String(st.routeId || '') + ':' + (arrived ? '1' : '0');
    var routeChanged = lastRouteKey === null || lastRouteKey.split(':')[0] !== String(st.routeId || '');
    if (lastRouteKey !== routeKey) {
      lastRouteKey = routeKey;
      globe.pointsData([
        { lat: fromLat, lng: fromLng, color: activeColor, radius: 0.35 },
        { lat: toLat, lng: toLng, color: arrived ? '#4ADE80' : '#F8FAFC', radius: 0.35 }
      ]);
      fromTagEl.textContent = String(st.codeFrom || '');
      toTagEl.textContent = String(st.codeTo || '');
      toTagEl.className = 'airport-tag' + (arrived ? ' arrived' : '');
      planeRingEl.className = 'plane-ring' + (arrived ? ' arrived' : '');
    }

    planeSvgEl.style.transform = 'rotate(' + heading.toFixed(1) + 'deg)';
    markerItems[0].lat = fromLat;
    markerItems[0].lng = fromLng;
    markerItems[1].lat = toLat;
    markerItems[1].lng = toLng;
    markerItems[2].lat = planePos.lat;
    markerItems[2].lng = planePos.lng;
    markerItems[2].alt = planeAlt;
    globe.htmlElementsData(markerItems.slice());

    if (focusCamera || routeChanged) {
      globe.pointOfView(routeView(st), focusCamera ? 650 : 0);
    }
  }

  function showOfflineFallback() {
    var loading = document.getElementById('loading');
    if (loading) {
      loading.textContent = '오프라인 상태에서는 3D 지구본을 불러올 수 없어요.';
      loading.style.opacity = '1';
    }
  }

  function init() {
    var container = document.getElementById('globeViz');
    if (window.__globeLoadFailed) {
      showOfflineFallback();
      return;
    }
    if (!window.Globe || !container) {
      initAttempts += 1;
      if (initAttempts > 50) {
        showOfflineFallback();
        return;
      }
      setTimeout(init, 120);
      return;
    }

    globe = window.Globe()(container)
      .backgroundColor('#060911')
      .globeImageUrl('https://unpkg.com/three-globe@2.41.12/example/img/earth-night.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png')
      .showAtmosphere(true)
      .atmosphereColor('#3B82F6')
      .atmosphereAltitude(0.16)
      .arcColor('color')
      .arcAltitude('altitude')
      .arcStroke('stroke')
      .arcDashLength('dashLen')
      .arcDashGap('dashGap')
      .arcDashAnimateTime('dashAnim')
      .pointColor('color')
      .pointAltitude(0.008)
      .pointRadius('radius')
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude('alt')
      .htmlElement(getMarkerElement)
      .width(container.clientWidth || window.innerWidth)
      .height(container.clientHeight || window.innerHeight);

    var controls = globe.controls();
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = false;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.65;
    controls.minDistance = 115;
    controls.maxDistance = 420;

    var loading = document.getElementById('loading');
    if (loading) loading.style.opacity = '0';

    renderState(currentState, true);

    function syncSize() {
      if (!globe) return;
      var w = container.clientWidth || window.innerWidth;
      var h = container.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        globe.width(w);
        globe.height(h);
      }
    }

    window.addEventListener('resize', syncSize);
    if (window.ResizeObserver) {
      resizeObs = new window.ResizeObserver(syncSize);
      resizeObs.observe(container);
    }
  }

  window.updateFlight = function (next) {
    if (!next || typeof next !== 'object') return;
    var prevRoute = lastRouteKey ? lastRouteKey.split(':')[0] : null;
    var routeChanged = !prevRoute || prevRoute !== String(next.routeId || '');
    renderState(next, routeChanged);
  };

  window.zoomGlobe = function (factor) {
    if (!globe || typeof factor !== 'number' || !isFinite(factor)) return;
    var pov = globe.pointOfView();
    var nextAlt = Math.max(0.2, Math.min(3.0, pov.altitude * factor));
    globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: nextAlt }, 280);
  };

  window.resetGlobe = function () {
    if (!globe) return;
    globe.pointOfView(routeView(currentState), 550);
  };

  function handleIncomingMessage(event) {
    if (window.parent && window.parent !== window && event.source && event.source !== window.parent) {
      return;
    }
    var raw = event && event.data;
    var msg = raw;
    if (typeof raw === 'string') {
      try { msg = JSON.parse(raw); } catch (_e) { return; }
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'update' && msg.state) window.updateFlight(msg.state);
    else if (msg.type === 'zoom' && typeof msg.factor === 'number') window.zoomGlobe(msg.factor);
    else if (msg.type === 'reset') window.resetGlobe();
  }

  window.addEventListener('message', handleIncomingMessage);
  document.addEventListener('message', handleIncomingMessage);

  window.addEventListener('pagehide', function () {
    if (resizeObs) {
      resizeObs.disconnect();
      resizeObs = null;
    }
    if (globe && typeof globe._destructor === 'function') {
      globe._destructor();
      globe = null;
    }
  });

  init();
})();
</script>
</body>
</html>`;
}
