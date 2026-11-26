import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
 * postMessage로 실시간 비행 진행률과 줌 조작을 전달한다.
 */
export const FlightGlobe = forwardRef<FlightGlobeHandle, Props>(function FlightGlobe(
  { state, height },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initialStateRef = useRef(state);
  const html = useMemo(() => buildFlightGlobeHtml(initialStateRef.current), []);

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
    iframeRef.current?.contentWindow?.postMessage({ type: 'update', state }, '*');
  }, [state]);

  return (
    <View style={[styles.container, height !== undefined ? { height } : styles.fill]}>
      <iframe
        ref={iframeRef}
        title="비행 경로 3D 지구본"
        srcDoc={html}
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
