import { useCallback, useMemo, useState } from 'react';

/**
 * 목록 화면에서 블럭을 길게 눌러 여러 개를 고른 뒤 한꺼번에 지울 때 쓰는 선택 상태 훅.
 */
export function useMultiSelect() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selecting = selectedIds.length > 0;

  const isSelected = useCallback((id: string) => selectedSet.has(id), [selectedSet]);

  const start = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const selectAll = useCallback((ids: readonly string[]) => {
    setSelectedIds([...new Set(ids)]);
  }, []);

  const clear = useCallback(() => {
    setSelectedIds([]);
  }, []);

  return {
    selectedIds,
    selectedSet,
    selecting,
    count: selectedIds.length,
    isSelected,
    start,
    toggle,
    selectAll,
    clear,
  };
}
