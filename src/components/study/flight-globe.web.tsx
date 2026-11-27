import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { buildFlightGlobeHtml, type FlightGlobeState } from './flight-globe-html';

export type FlightGlobeHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

type Props = {
  state: FlightGlobeState;
  height?: number;
  onInteractChange?: (interacting: boolean) => void;
};

/**
 * 웹용 iframe + Globe.gl 3D 지구본 뷰.
 * sandbox="allow-scripts" 로 부모 오리진(localStorage 토큰 등)과 완전히 격리하고,
 * postMessage로 실시간 비행 진행률과 줌 조작을 전달한다.
 */
export const FlightGlobe = forwardRef<FlightGlobeHandle, Props>(function FlightGlobe(
  { state, height, onInteractChange },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initialStateRef = useRef(state);
  const latestStateRef = useRef(state);
  const lastSentSigRef = useRef('');
  latestStateRef.current = state;

  const html = useMemo(() => buildFlightGlobeHtml(initialStateRef.current), []);

  const postUpdate = useCallback((target: FlightGlobeState, force = false) => {
    const quantizedProgress = Math.round(target.progress * 2000) / 2000;
    const sig = `${target.routeId}:${target.arrived ? 1 : 0}:${target.running ? 1 : 0}:${quantizedProgress}`;
    if (!force && sig === lastSentSigRef.current) return;
    lastSentSigRef.current = sig;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'update', state: { ...target, progress: quantizedProgress } },
      '*',
    );
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'zoom', factor: 0.72 }, '*');
    },
    zoomOut: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'zoom', factor: 1.38 }, '*');
    },
    reset: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'reset' }, '*');
    },
  }));

  useEffect(() => {
    postUpdate(state);
  }, [postUpdate, state]);

  return (
    <View
      style={[styles.container, height !== undefined ? { height } : styles.fill]}
      onPointerDown={() => onInteractChange?.(true)}
      onPointerUp={() => onInteractChange?.(false)}
      onPointerCancel={() => onInteractChange?.(false)}>
      <iframe
        ref={iframeRef}
        title="비행 경로 3D 지구본"
        sandbox="allow-scripts"
        srcDoc={html}
        onLoad={() => postUpdate(latestStateRef.current, true)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          backgroundColor: '#060911',
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#060911',
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
});
