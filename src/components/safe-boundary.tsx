import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reportError } from '@/lib/error-report';

type Props = {
  /** 오류 기록에 남길 위치 이름 (예: 'tab:todos') */
  name: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * 화면을 그리다가 생긴 오류가 앱 전체를 종료시키지 않도록 막는 보호막.
 * 오류가 나면 해당 영역에만 안내와 "다시 시도" 버튼을 보여주고, 오류는 기록한다.
 * 테마 훅에 의존하지 않도록 기본 색만 쓴다(테마 쪽 오류여도 화면이 나오게).
 */
export class SafeBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      const wrapped = new Error(error?.message || String(error));
      wrapped.name = error?.name || 'Error';
      wrapped.stack = `${error?.stack ?? ''}\n${info.componentStack ?? ''}`;
      reportError(this.props.name, wrapped);
    } catch {
      // 기록 실패는 무시한다.
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>화면을 불러오지 못했습니다</Text>
        <Text style={styles.message} numberOfLines={6}>
          {__DEV__
            ? error.message || String(error)
            : '일시적인 오류가 발생했습니다. 다시 시도해 주세요.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#8B8B96',
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  buttonText: {
    color: '#000000',
    fontWeight: '700',
  },
});
