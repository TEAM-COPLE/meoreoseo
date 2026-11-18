/**
 * 색상 태그에 쓰는 색.
 * 데이터베이스에는 색 이름('red' 등)만 저장하고, 실제 색은 여기서 밝은/어두운 화면에 맞게 고른다.
 * (색 이름을 늘리려면 supabase 의 tags.color 제한도 함께 바꿔야 한다.)
 */

export const TAG_COLORS = {
  red: { label: '빨강', light: '#E03131', dark: '#FF6B6B' },
  orange: { label: '주황', light: '#E8590C', dark: '#FF922B' },
  yellow: { label: '노랑', light: '#E0A800', dark: '#FFD43B' },
  green: { label: '초록', light: '#2F9E44', dark: '#69DB7C' },
  teal: { label: '청록', light: '#0C8599', dark: '#3BC9DB' },
  blue: { label: '파랑', light: '#1C7ED6', dark: '#4DABF7' },
  indigo: { label: '남색', light: '#4263EB', dark: '#91A7FF' },
  purple: { label: '보라', light: '#9C36B5', dark: '#DA77F2' },
  pink: { label: '분홍', light: '#D6336C', dark: '#F783AC' },
  gray: { label: '회색', light: '#868E96', dark: '#ADB5BD' },
} as const;

export type TagColor = keyof typeof TAG_COLORS;

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS) as TagColor[];

export const MAX_TAG_NAME = 30;

function isTagColor(value: string): value is TagColor {
  return value in TAG_COLORS;
}

/** 색 이름을 지금 화면 모드에 맞는 실제 색으로 바꾼다. 모르는 이름이면 회색 */
export function tagColorValue(color: string, scheme: 'light' | 'dark'): string {
  return TAG_COLORS[isTagColor(color) ? color : 'gray'][scheme];
}

/** 태그 색을 옅게 깐 배경색 (#RRGGBB 뒤에 투명도를 붙인다) */
export function tagSoftBackground(hex: string, scheme: 'light' | 'dark'): string {
  return `${hex}${scheme === 'dark' ? '33' : '1F'}`;
}
