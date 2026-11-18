import { useSyncExternalStore } from 'react';

export const SWIPE_ROUTES = [
  { path: '/', label: '오늘' },
  { path: '/todos', label: '할 일' },
  { path: '/calendar', label: '일정' },
  { path: '/notes', label: '메모' },
  { path: '/money', label: '가계부' },
] as const;

export type SwipeRoute = (typeof SWIPE_ROUTES)[number];
export type SwipeRoutePath = SwipeRoute['path'];

let swipeLocked = false;
const lockListeners = new Set<() => void>();

function notifyLockListeners() {
  for (const listener of lockListeners) {
    listener();
  }
}

function subscribeLock(listener: () => void) {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

function getLockSnapshot() {
  return swipeLocked;
}

/**
 * 오늘 화면 상자 드래그 등 세로/드래그 조작 중 가로 스와이프를 잠시 잠근다.
 */
export function setSwipeLocked(locked: boolean) {
  if (swipeLocked === locked) return;
  swipeLocked = locked;
  notifyLockListeners();
}

export function useIsSwipeLocked() {
  return useSyncExternalStore(subscribeLock, getLockSnapshot, () => false);
}

export function indexOfSwipeRoute(pathname: string): number {
  return SWIPE_ROUTES.findIndex((route) => route.path === pathname);
}
