import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType,
  type Ref,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import {
  buildFlightGlobeHtml,
  safeJsonForScript,
  type FlightGlobeState,
} from './flight-globe-html';

type WebViewRef = {
  injectJavaScript: (script: string) => void;
};

const NativeWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewRef> }>;

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
 * 네이티브(iOS · Android)용 WebView + Globe.gl 3D 지구본 뷰.
 * HTML은 최초 1회만 로드하고, 이후 경과 시간·노선 변경은 이스케이프된 injectJavaScript로 반영한다.
 */
export const FlightGlobe = forwardRef<FlightGlobeHandle, Props>(function FlightGlobe(
  { state, height, onInteractChange },
  ref,
) {
  const webViewRef = useRef<WebViewRef>(null);
  const initialStateRef = useRef(state);
  const latestStateRef = useRef(state);
  const lastSentSigRef = useRef('');
  latestStateRef.current = state;

  const html = useMemo(() => buildFlightGlobeHtml(initialStateRef.current), []);

  const pushState = useCallback((target: FlightGlobeState, force = false) => {
    const quantizedProgress = Math.round(target.progress * 2000) / 2000;
    const sig = `${target.routeId}:${target.arrived ? 1 : 0}:${target.running ? 1 : 0}:${quantizedProgress}`;
    if (!force && sig === lastSentSigRef.current) return;
    lastSentSigRef.current = sig;
    const payload = safeJsonForScript({ ...target, progress: quantizedProgress });
    webViewRef.current?.injectJavaScript(
      `window.updateFlight && window.updateFlight(${payload}); true;`,
    );
  }, []);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      webViewRef.current?.injectJavaScript('window.zoomGlobe && window.zoomGlobe(0.72); true;');
    },
    zoomOut: () => {
      webViewRef.current?.injectJavaScript('window.zoomGlobe && window.zoomGlobe(1.38); true;');
    },
    reset: () => {
      webViewRef.current?.injectJavaScript('window.resetGlobe && window.resetGlobe(); true;');
    },
  }));

  useEffect(() => {
    pushState(state);
  }, [pushState, state]);

  return (
    <View
      style={[styles.container, height !== undefined ? { height } : styles.fill]}
      onTouchStart={() => onInteractChange?.(true)}
      onTouchEnd={() => onInteractChange?.(false)}
      onTouchCancel={() => onInteractChange?.(false)}>
      <NativeWebView
        ref={webViewRef}
        originWhitelist={['about:blank']}
        onShouldStartLoadWithRequest={(request) =>
          request.url === 'about:blank' || request.url.startsWith('about:')
        }
        onLoadEnd={() => pushState(latestStateRef.current, true)}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled
        androidLayerType="hardware"
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
  webview: {
    flex: 1,
    backgroundColor: '#060911',
  },
});
