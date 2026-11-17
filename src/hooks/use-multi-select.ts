import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, type GestureResponderEvent } from 'react-native';

function readModifier(
  event: GestureResponderEvent | undefined,
  key: 'shiftKey' | 'ctrlKey' | 'metaKey',
): boolean {
  if (Platform.OS !== 'web' || !event) return false;
  const native = event.nativeEvent as unknown as Record<string, unknown> | undefined;
  return Boolean(native && native[key]);
}

/** 웹에서 Ctrl/Cmd+클릭으로 바로 다중 선택에 들어가는지 확인한다. */
export function hasSelectionModifier(event?: GestureResponderEvent): boolean {
  return readModifier(event, 'ctrlKey') || readModifier(event, 'metaKey');
}

/**
 * 목록 화면에서 여러 항목을 고른 뒤 한꺼번에 지울 때 쓰는 선택 상태 훅.
 * 모바일에서는 길게 눌러 시작하고, 웹에서는 "선택" 버튼이나 Ctrl/Cmd+클릭, Shift+클릭도 지원한다.
 */
export function useMultiSelect() {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lastIdRef = useRef<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selecting = active || selectedIds.length > 0;

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  /** 선택 모드를 연다(웹의 "선택" 버튼처럼 아직 고른 항목이 없어도 체크 UI를 띄울 때). */
  const enter = useCallback(() => {
    setActive(true);
  }, []);

  const start = useCallback((id: string) => {
    lastIdRef.current = id;
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const toggle = useCallback((id: string) => {
    lastIdRef.current = id;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const selectRange = useCallback((orderedIds: readonly string[], targetId: string) => {
    const anchorId = lastIdRef.current;
    if (!anchorId) {
      lastIdRef.current = targetId;
      setSelectedIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      return;
    }
    const startIdx = orderedIds.indexOf(anchorId);
    const endIdx = orderedIds.indexOf(targetId);
    if (startIdx === -1 || endIdx === -1) {
      lastIdRef.current = targetId;
      setSelectedIds((prev) =>
        prev.includes(targetId) ? prev.filter((item) => item !== targetId) : [...prev, targetId],
      );
      return;
    }
    const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const rangeIds = orderedIds.slice(from, to + 1);
    lastIdRef.current = targetId;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of rangeIds) next.add(id);
      return [...next];
    });
  }, []);

  const handlePress = useCallback(
    (id: string, orderedIds: readonly string[], event?: GestureResponderEvent) => {
      if (readModifier(event, 'shiftKey')) {
        selectRange(orderedIds, id);
      } else {
        toggle(id);
      }
    },
    [selectRange, toggle],
  );

  const selectAll = useCallback((ids: readonly string[]) => {
    const unique = [...new Set(ids)];
    lastIdRef.current = unique.length > 0 ? unique[unique.length - 1] : null;
    setSelectedIds(unique);
  }, []);

  /** 선택된 항목만 비운다. "선택" 버튼으로 들어온 경우에는 선택 모드를 유지한다. */
  const deselectAll = useCallback(() => {
    lastIdRef.current = null;
    setSelectedIds([]);
  }, []);

  const clear = useCallback(() => {
    lastIdRef.current = null;
    setActive(false);
    setSelectedIds([]);
  }, []);

  return {
    selectedIds,
    selectedSet,
    active,
    selecting,
    count: selectedIds.length,
    isSelected,
    enter,
    start,
    toggle,
    selectRange,
    handlePress,
    selectAll,
    deselectAll,
    clear,
  };
}
