import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType,
  type Ref,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import { buildFlightGlobeHtml, type FlightGlobeState } from './flight-globe-html';

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
 * HTML은 최초 1회만 로드하고, 이후 경과 시간·노선 변경은 injectJavaScript로 부드럽게 반영한다.
 */
export const FlightGlobe = forwardRef<FlightGlobeHandle, Props>(function FlightGlobe(
  { state, height, onInteractChange },
  ref,
) {
  const webViewRef = useRef<WebViewRef>(null);
  const initialStateRef = useRef(state);
  const html = useMemo(() => buildFlightGlobeHtml(initialStateRef.current), []);

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
    const payload = JSON.stringify(state);
    webViewRef.current?.injectJavaScript(
      `window.updateFlight && window.updateFlight(${payload}); true;`,
    );
  }, [state]);

  return (
    <View
      style={[styles.container, height !== undefined ? { height } : styles.fill]}
      onTouchStart={() => onInteractChange?.(true)}
      onTouchEnd={() => onInteractChange?.(false)}
      onTouchCancel={() => onInteractChange?.(false)}>
      <NativeWebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
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
