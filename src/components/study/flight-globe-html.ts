/**
 * Globe.gl 기반 3D 지구본 + 실시간 비행 경로 HTML 생성기.
 * 모바일(react-native-webview)과 웹(iframe)에서 동일한 HTML을 사용한다.
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

export function buildFlightGlobeHtml(initial: FlightGlobeState): string {
  const initialJson = JSON.stringify(initial);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
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
<script src="https://unpkg.com/globe.gl@2.43.0/dist/globe.gl.min.js"></script>
</head>
<body>
<div id="globeViz"></div>
<div id="loading" class="loading-text">지구본 불러오는 중…</div>
<script>
(function () {
  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var currentState = ${initialJson};
  var lastRouteId = null;
  var globe = null;

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
    currentState = st;
    if (!globe) return;

    var t = Math.max(0, Math.min(1, st.progress || 0));
    var distDeg = angularDistanceDeg(st.fromLat, st.fromLng, st.toLat, st.toLng);
    var arcAlt = Math.max(0.05, Math.min(0.28, distDeg * 0.0032));
    var planePos = slerp(st.fromLat, st.fromLng, st.toLat, st.toLng, t);
    var nextPos = slerp(st.fromLat, st.fromLng, st.toLat, st.toLng, Math.min(1, t + 0.02));
    var prevPos = slerp(st.fromLat, st.fromLng, st.toLat, st.toLng, Math.max(0, t - 0.02));
    var heading = t < 0.98
      ? bearing(planePos.lat, planePos.lng, nextPos.lat, nextPos.lng)
      : bearing(prevPos.lat, prevPos.lng, planePos.lat, planePos.lng);
    var planeAlt = Math.sin(Math.PI * t) * arcAlt + 0.015;
    var activeColor = st.arrived ? '#4ADE80' : '#60A5FA';

    var arcs = [
      {
        startLat: st.fromLat,
        startLng: st.fromLng,
        endLat: st.toLat,
        endLng: st.toLng,
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
        startLat: st.fromLat,
        startLng: st.fromLng,
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

    globe
      .arcsData(arcs)
      .arcColor('color')
      .arcAltitude('altitude')
      .arcStroke('stroke')
      .arcDashLength('dashLen')
      .arcDashGap('dashGap')
      .arcDashAnimateTime('dashAnim');

    globe
      .pointsData([
        { lat: st.fromLat, lng: st.fromLng, color: activeColor, radius: 0.35 },
        { lat: st.toLat, lng: st.toLng, color: st.arrived ? '#4ADE80' : '#F8FAFC', radius: 0.35 }
      ])
      .pointColor('color')
      .pointAltitude(0.008)
      .pointRadius('radius');

    globe
      .htmlElementsData([
        { type: 'airport', lat: st.fromLat, lng: st.fromLng, alt: 0.01, label: st.codeFrom, arrived: false },
        { type: 'airport', lat: st.toLat, lng: st.toLng, alt: 0.01, label: st.codeTo, arrived: st.arrived },
        { type: 'plane', lat: planePos.lat, lng: planePos.lng, alt: planeAlt, heading: heading, arrived: st.arrived }
      ])
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude('alt')
      .htmlElement(function (d) {
        if (d.type === 'airport') {
          var tag = document.createElement('div');
          tag.className = 'airport-tag' + (d.arrived ? ' arrived' : '');
          tag.textContent = d.label;
          return tag;
        }
        var wrap = document.createElement('div');
        wrap.className = 'plane-marker';
        var ring = document.createElement('div');
        ring.className = 'plane-ring' + (d.arrived ? ' arrived' : '');
        wrap.appendChild(ring);
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.style.transform = 'rotate(' + d.heading.toFixed(1) + 'deg)';
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z');
        p.setAttribute('fill', '#FFFFFF');
        p.setAttribute('stroke', '#060911');
        p.setAttribute('stroke-width', '0.7');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
        wrap.appendChild(svg);
        return wrap;
      });

    if (focusCamera || lastRouteId !== st.routeId) {
      lastRouteId = st.routeId;
      globe.pointOfView(routeView(st), focusCamera ? 650 : 0);
    }
  }

  function init() {
    var container = document.getElementById('globeViz');
    if (!window.Globe || !container) {
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
      new window.ResizeObserver(syncSize).observe(container);
    }
  }

  window.updateFlight = function (next) {
    var routeChanged = !lastRouteId || lastRouteId !== next.routeId;
    renderState(next, routeChanged);
  };

  window.zoomGlobe = function (factor) {
    if (!globe) return;
    var pov = globe.pointOfView();
    var nextAlt = Math.max(0.2, Math.min(3.0, pov.altitude * factor));
    globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: nextAlt }, 280);
  };

  window.resetGlobe = function () {
    if (!globe) return;
    globe.pointOfView(routeView(currentState), 550);
  };

  window.addEventListener('message', function (event) {
    var msg = event && event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'update' && msg.state) window.updateFlight(msg.state);
    else if (msg.type === 'zoom' && typeof msg.factor === 'number') window.zoomGlobe(msg.factor);
    else if (msg.type === 'reset') window.resetGlobe();
  });

  init();
})();
</script>
</body>
</html>`;
}
