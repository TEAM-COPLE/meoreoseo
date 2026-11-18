import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 웹에서 '/' 키를 누르면 검색창에 바로 포커스를 맞추는 단축키 훅.
 * 이미 입력창(INPUT/TEXTAREA)에 포커스가 있을 때는 동작하지 않는다.
 */
export function useWebSearchShortcut(onTrigger: () => void) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      event.preventDefault();
      onTrigger();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTrigger]);
}
