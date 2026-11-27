import { Armchair, Plane, Utensils } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { formatFlightMinutes, type FlightRoute } from './flight-routes';

// 광동체(B777-300ER) 3클래스 좌석 배치: F(1-2-1), C(2-3-2), Y(3-3-3 → 꼬리 2-3-2)
const FIRST_ROWS = [1, 2] as const;
const BUSINESS_FRONT_ROWS = [7, 8] as const;
const BUSINESS_REAR_ROWS = [9, 10, 11, 12, 14, 15] as const;
const ECONOMY_FRONT_ROWS = [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40] as const;
const ECONOMY_REAR_ROWS = [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51] as const;
const ECONOMY_TAIL_ROWS = [52, 53] as const;

export function seatClassLabel(seat: string): string {
  const row = Number.parseInt(seat, 10);
  if (row <= 2) return '퍼스트';
  if (row <= 15) return '비즈니스';
  return '이코노미';
}

export function seatClassCode(seat: string): string {
  const row = Number.parseInt(seat, 10);
  if (row <= 2) return 'FIRST';
  if (row <= 15) return 'BUSINESS';
  return 'ECONOMY';
}

export function seatPositionLabel(seat: string): string {
  const row = Number.parseInt(seat, 10);
  const col = seat.slice(-1).toUpperCase();
  if (col === 'A' || col === 'J') return '창가석';
  if (row <= 2) return '중앙석';
  if (row <= 15) {
    if (col === 'E') return '중앙석';
    return '복도석';
  }
  if (col === 'B' || col === 'E' || col === 'H') return '중앙석';
  return '복도석';
}

function ExitRow() {
  return (
    <View style={styles.exitRow}>
      <View style={styles.exitBadge}>
        <ThemedText style={styles.exitText}>EXIT</ThemedText>
      </View>
      <View style={styles.exitBadge}>
        <ThemedText style={styles.exitText}>EXIT</ThemedText>
      </View>
    </View>
  );
}

function FacilityPill({ label, isGalley = false }: { label?: string; isGalley?: boolean }) {
  return (
    <View style={styles.facilityBox}>
      {isGalley ? (
        <Utensils size={11} color="#94A3B8" strokeWidth={2} />
      ) : (
        <ThemedText style={styles.facilityText}>{label}</ThemedText>
      )}
    </View>
  );
}

/**
 * 블랙 테마의 샤프한 여객기(B777-300ER) 실루엣 + 3클래스(F · C · Y) 좌석 선택기.
 * 예약석 제한 없이 모든 좌석을 자유롭게 선택할 수 있다.
 */
export function FlightSeatSelector({
  selectedSeat,
  onSelectSeat,
}: {
  selectedSeat: string;
  onSelectSeat: (seat: string) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);

  const hullFill = '#111622';
  const hullStroke = '#2D384E';
  const wingFill = '#151C2B';
  const engineFill = '#1D273B';
  const cockpitGlass = '#05070C';
  const cockpitFrame = '#3B4A68';

  // 데스크톱(넓은 화면)에서는 동체 양옆 여백을 활용해 날개 끝단(윙팁)까지 전체 주날개를 표시한다.
  const effectiveWidth =
    scrollAreaWidth > 0 ? scrollAreaWidth : Platform.OS === 'web' ? Math.min(windowWidth - 80, 640) : 312;
  const showFullWings = effectiveWidth >= 420;
  const fullWingWidth = showFullWings
    ? Math.max(100, Math.min(250, Math.floor((effectiveWidth - 248) / 2) - 4))
    : 44;
  const assemblyWidth = showFullWings ? 248 + fullWingWidth * 2 : 312;
  const tailWidth = showFullWings
    ? Math.min(assemblyWidth, 248 + Math.round(fullWingWidth * 0.96))
    : 312;
  const tailCx = tailWidth / 2;
  const tailWingOut = showFullWings ? Math.min(tailCx - 8, 124 + Math.round(fullWingWidth * 0.44)) : 134;

  function renderFirstSeat(seatId: string) {
    const selected = selectedSeat === seatId;
    return (
      <Pressable
        key={seatId}
        accessibilityRole="radio"
        accessibilityLabel={`${seatId} 퍼스트 클래스 ${seatPositionLabel(seatId)}`}
        accessibilityState={{ selected }}
        onPress={() => onSelectSeat(seatId)}
        style={({ pressed }) => [
          styles.firstSuiteFrame,
          {
            borderColor: selected ? '#F59E0B' : '#334155',
            backgroundColor: selected ? 'rgba(245, 158, 11, 0.14)' : '#0B0F18',
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        <View
          style={[
            styles.firstHeadrest,
            { backgroundColor: selected ? '#F59E0B' : '#475569' },
          ]}
        />
        <View
          style={[
            styles.firstSeatBody,
            { backgroundColor: selected ? '#D97706' : '#1E293B' },
          ]}>
          <ThemedText style={styles.seatCodeWhite}>{seatId}</ThemedText>
        </View>
      </Pressable>
    );
  }

  function renderBusinessSeat(seatId: string) {
    const selected = selectedSeat === seatId;
    return (
      <Pressable
        key={seatId}
        accessibilityRole="radio"
        accessibilityLabel={`${seatId} 비즈니스 클래스 ${seatPositionLabel(seatId)}`}
        accessibilityState={{ selected }}
        onPress={() => onSelectSeat(seatId)}
        style={({ pressed }) => [
          styles.bizSeat,
          {
            backgroundColor: selected ? '#2563EB' : '#172554',
            borderColor: selected ? '#60A5FA' : '#2E4583',
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        <ThemedText style={styles.bizSeatText}>{seatId}</ThemedText>
      </Pressable>
    );
  }

  function renderEconomySeat(seatId: string, preferred = false) {
    const selected = selectedSeat === seatId;
    return (
      <Pressable
        key={seatId}
        accessibilityRole="radio"
        accessibilityLabel={`${seatId} 이코노미 클래스 ${seatPositionLabel(seatId)}`}
        accessibilityState={{ selected }}
        onPress={() => onSelectSeat(seatId)}
        style={({ pressed }) => [
          styles.ecoSeat,
          {
            backgroundColor: selected
              ? '#0EA5E9'
              : preferred
                ? '#132238'
                : '#0C111C',
            borderColor: selected
              ? '#7DD3FC'
              : preferred
                ? '#38BDF8'
                : '#334155',
            opacity: pressed ? 0.72 : 1,
          },
        ]}>
        <ThemedText
          style={[
            styles.ecoSeatText,
            { color: selected ? '#FFFFFF' : preferred ? '#7DD3FC' : '#CBD5E1' },
          ]}>
          {seatId.slice(-1)}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.cabinCard}>
      {/* 상단 제목 + 클래스 범례 */}
      <View style={styles.cabinHeader}>
        <View style={styles.cabinTitleRow}>
          <Armchair size={15} color="#94A3B8" strokeWidth={2} />
          <ThemedText type="smallBold" style={{ color: '#F8FAFC' }}>
            기내 좌석 배치도
          </ThemedText>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#D97706' }]} />
            <ThemedText type="small" style={styles.legendText}>
              F 퍼스트
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
            <ThemedText type="small" style={styles.legendText}>
              C 비즈니스
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: '#0C111C', borderWidth: 1, borderColor: '#38BDF8' },
              ]}
            />
            <ThemedText type="small" style={styles.legendText}>
              Y 이코노미
            </ThemedText>
          </View>
        </View>
      </View>

      <ThemedText type="small" style={styles.selectedSummary}>
        선택 좌석: {selectedSeat} · {seatClassLabel(selectedSeat)} · {seatPositionLabel(selectedSeat)}
      </ThemedText>

      {/* 스크롤 가능한 블랙 테마 샤프 여객기 좌석 맵 */}
      <ScrollView
        nestedScrollEnabled
        onLayout={(e) => {
          const w = Math.floor(e.nativeEvent.layout.width);
          if (w > 0 && Math.abs(w - scrollAreaWidth) > 2) {
            setScrollAreaWidth(w);
          }
        }}
        style={[styles.planeScroll, showFullWings && styles.planeScrollDesktop]}
        contentContainerStyle={styles.planeScrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.planeAssembly, { width: assemblyWidth }]}>
          {/* 1. 샤프한 유선형 기수 (Pointed Ogive Nose + 4분할 조종석 창) */}
          <View style={styles.noseSvgWrap}>
            <Svg width={250} height={148} viewBox="0 0 250 148">
              <Path
                d="M 1 148 C 3 92, 42 42, 108 10 Q 125 1 142 10 C 208 42, 247 92, 249 148 Z"
                fill={hullFill}
                stroke={hullStroke}
                strokeWidth={1.5}
              />
              {/* 기수 레이돔 미세 라인 */}
              <Path
                d="M 96 24 Q 125 18 154 24"
                fill="none"
                stroke="#253046"
                strokeWidth={1}
              />
              {/* 4분할 샤프 조종석 유리창 */}
              <Path
                d="M 74 72 L 101 52 L 106 63 L 83 80 Z"
                fill={cockpitGlass}
                stroke={cockpitFrame}
                strokeWidth={1}
              />
              <Path
                d="M 105 50 L 123 43 L 123 58 L 109 62 Z"
                fill={cockpitGlass}
                stroke={cockpitFrame}
                strokeWidth={1}
              />
              <Path
                d="M 127 43 L 145 50 L 141 62 L 127 58 Z"
                fill={cockpitGlass}
                stroke={cockpitFrame}
                strokeWidth={1}
              />
              <Path
                d="M 149 52 L 176 72 L 167 80 L 144 63 Z"
                fill={cockpitGlass}
                stroke={cockpitFrame}
                strokeWidth={1}
              />
            </Svg>
          </View>

          {/* 2. 동체 + 후퇴익 주날개 & 엔진 나셀 */}
          <View style={[styles.fuselageOuter, { width: assemblyWidth }]}>
            {showFullWings ? (
              <>
                {/* 데스크톱 전체 주날개 (왼쪽 후퇴익 + 레이크드 윙팁 + GE90 엔진 + 항법등) */}
                <View pointerEvents="none" style={[styles.wingLeftFull, { left: 1 }]}>
                  <Svg width={fullWingWidth} height={340} viewBox={`0 0 ${fullWingWidth} 340`}>
                    {/* 주날개 몸체 (후퇴익 + 레이크드 윙팁 + 인보드 예후디) */}
                    <Path
                      d={`M ${fullWingWidth} 0 L ${Math.round(fullWingWidth * 0.1)} 172 L 2 214 L 8 228 L ${Math.round(fullWingWidth * 0.56)} 214 L ${fullWingWidth} 244 Z`}
                      fill={wingFill}
                      stroke={hullStroke}
                      strokeWidth={1.3}
                    />
                    {/* 앞전 슬랫 라인 */}
                    <Line
                      x1={fullWingWidth - 4}
                      y1={16}
                      x2={Math.round(fullWingWidth * 0.14)}
                      y2={178}
                      stroke="#232E45"
                      strokeWidth={1}
                    />
                    {/* 뒷전 플랩 / 에일러론 분할선 */}
                    <Path
                      d={`M ${Math.round(fullWingWidth * 0.12)} 208 L ${Math.round(fullWingWidth * 0.56)} 196 L ${fullWingWidth - 4} 222`}
                      fill="none"
                      stroke="#232E45"
                      strokeWidth={1}
                    />
                    {/* 플랩 트랙 페어링 (3개) */}
                    {[0.32, 0.52, 0.72].map((ratio) => {
                      const fx = Math.round(fullWingWidth * ratio);
                      const fy = ratio < 0.56 ? Math.round(218 - ratio * 16) : Math.round(210 + (ratio - 0.56) * 58);
                      return (
                        <Rect
                          key={`fl-${ratio}`}
                          x={fx - 2}
                          y={fy}
                          width={4}
                          height={16}
                          rx={2}
                          fill="#1E293B"
                          stroke={hullStroke}
                          strokeWidth={0.8}
                        />
                      );
                    })}
                    {/* 엔진 파일론 */}
                    <Rect
                      x={Math.round(fullWingWidth * 0.66) - 4}
                      y={66}
                      width={8}
                      height={54}
                      rx={2}
                      fill="#192336"
                      stroke={hullStroke}
                      strokeWidth={0.9}
                    />
                    {/* 왼쪽 대형 터보팬 제트 엔진 나셀 */}
                    <Rect
                      x={Math.round(fullWingWidth * 0.66) - 12}
                      y={38}
                      width={24}
                      height={56}
                      rx={10}
                      fill={engineFill}
                      stroke={hullStroke}
                      strokeWidth={1.2}
                    />
                    {/* 엔진 흡기구 링 */}
                    <Rect
                      x={Math.round(fullWingWidth * 0.66) - 9}
                      y={40}
                      width={18}
                      height={6}
                      rx={3}
                      fill="#0B0F18"
                      stroke="#475569"
                      strokeWidth={0.8}
                    />
                    {/* 엔진 배기 노즐 */}
                    <Path
                      d={`M ${Math.round(fullWingWidth * 0.66) - 7} 94 L ${Math.round(fullWingWidth * 0.66) + 7} 94 L ${Math.round(fullWingWidth * 0.66) + 4} 106 L ${Math.round(fullWingWidth * 0.66) - 4} 106 Z`}
                      fill="#0F172A"
                      stroke={hullStroke}
                      strokeWidth={0.9}
                    />
                    {/* 좌현 적색 항법등 */}
                    <Circle cx={5} cy={216} r={2.5} fill="#EF4444" />
                  </Svg>
                </View>

                {/* 데스크톱 전체 주날개 (오른쪽 후퇴익 + 레이크드 윙팁 + GE90 엔진 + 항법등) */}
                <View pointerEvents="none" style={[styles.wingRightFull, { right: 1 }]}>
                  <Svg width={fullWingWidth} height={340} viewBox={`0 0 ${fullWingWidth} 340`}>
                    {/* 주날개 몸체 */}
                    <Path
                      d={`M 0 0 L ${Math.round(fullWingWidth * 0.9)} 172 L ${fullWingWidth - 2} 214 L ${fullWingWidth - 8} 228 L ${Math.round(fullWingWidth * 0.44)} 214 L 0 244 Z`}
                      fill={wingFill}
                      stroke={hullStroke}
                      strokeWidth={1.3}
                    />
                    {/* 앞전 슬랫 라인 */}
                    <Line
                      x1={4}
                      y1={16}
                      x2={Math.round(fullWingWidth * 0.86)}
                      y2={178}
                      stroke="#232E45"
                      strokeWidth={1}
                    />
                    {/* 뒷전 플랩 / 에일러론 분할선 */}
                    <Path
                      d={`M ${Math.round(fullWingWidth * 0.88)} 208 L ${Math.round(fullWingWidth * 0.44)} 196 L 4 222`}
                      fill="none"
                      stroke="#232E45"
                      strokeWidth={1}
                    />
                    {/* 플랩 트랙 페어링 (3개) */}
                    {[0.32, 0.52, 0.72].map((ratio) => {
                      const fx = fullWingWidth - Math.round(fullWingWidth * ratio);
                      const fy = ratio < 0.56 ? Math.round(218 - ratio * 16) : Math.round(210 + (ratio - 0.56) * 58);
                      return (
                        <Rect
                          key={`fr-${ratio}`}
                          x={fx - 2}
                          y={fy}
                          width={4}
                          height={16}
                          rx={2}
                          fill="#1E293B"
                          stroke={hullStroke}
                          strokeWidth={0.8}
                        />
                      );
                    })}
                    {/* 엔진 파일론 */}
                    <Rect
                      x={fullWingWidth - Math.round(fullWingWidth * 0.66) - 4}
                      y={66}
                      width={8}
                      height={54}
                      rx={2}
                      fill="#192336"
                      stroke={hullStroke}
                      strokeWidth={0.9}
                    />
                    {/* 오른쪽 대형 터보팬 제트 엔진 나셀 */}
                    <Rect
                      x={fullWingWidth - Math.round(fullWingWidth * 0.66) - 12}
                      y={38}
                      width={24}
                      height={56}
                      rx={10}
                      fill={engineFill}
                      stroke={hullStroke}
                      strokeWidth={1.2}
                    />
                    {/* 엔진 흡기구 링 */}
                    <Rect
                      x={fullWingWidth - Math.round(fullWingWidth * 0.66) - 9}
                      y={40}
                      width={18}
                      height={6}
                      rx={3}
                      fill="#0B0F18"
                      stroke="#475569"
                      strokeWidth={0.8}
                    />
                    {/* 엔진 배기 노즐 */}
                    <Path
                      d={`M ${fullWingWidth - Math.round(fullWingWidth * 0.66) - 7} 94 L ${fullWingWidth - Math.round(fullWingWidth * 0.66) + 7} 94 L ${fullWingWidth - Math.round(fullWingWidth * 0.66) + 4} 106 L ${fullWingWidth - Math.round(fullWingWidth * 0.66) - 4} 106 Z`}
                      fill="#0F172A"
                      stroke={hullStroke}
                      strokeWidth={0.9}
                    />
                    {/* 우현 녹색 항법등 */}
                    <Circle cx={fullWingWidth - 5} cy={216} r={2.5} fill="#22C55E" />
                  </Svg>
                </View>
              </>
            ) : (
              <>
                {/* 모바일 컴팩트 주날개 + 제트 엔진 */}
                <View pointerEvents="none" style={styles.wingLeft}>
                  <Svg width={44} height={300} viewBox="0 0 44 300">
                    <Path
                      d="M 44 0 L 2 108 L 2 132 L 44 270 Z"
                      fill={wingFill}
                      stroke={hullStroke}
                      strokeWidth={1.2}
                    />
                    <Line x1={12} y1={134} x2={42} y2={236} stroke="#232E45" strokeWidth={1} />
                    <Rect
                      x={14}
                      y={52}
                      width={15}
                      height={38}
                      rx={6}
                      fill={engineFill}
                      stroke={hullStroke}
                      strokeWidth={1.1}
                    />
                  </Svg>
                </View>
                <View pointerEvents="none" style={styles.wingRight}>
                  <Svg width={44} height={300} viewBox="0 0 44 300">
                    <Path
                      d="M 0 0 L 42 108 L 42 132 L 0 270 Z"
                      fill={wingFill}
                      stroke={hullStroke}
                      strokeWidth={1.2}
                    />
                    <Line x1={32} y1={134} x2={2} y2={236} stroke="#232E45" strokeWidth={1} />
                    <Rect
                      x={15}
                      y={52}
                      width={15}
                      height={38}
                      rx={6}
                      fill={engineFill}
                      stroke={hullStroke}
                      strokeWidth={1.1}
                    />
                  </Svg>
                </View>
              </>
            )}

            {/* 동체 내부 객실 (블랙 테마) */}
            <View
              style={[
                styles.fuselageBody,
                { backgroundColor: hullFill, borderColor: hullStroke },
              ]}>
              <View style={styles.facilityCenterRow}>
                <FacilityPill isGalley />
                <FacilityPill label="WC" />
              </View>
              <ExitRow />

              {/* ── F: 퍼스트 클래스 (1–2열, 1-2-1) ── */}
              <View style={styles.sectionBlock}>
                <View style={styles.classBadgeRow}>
                  <View style={styles.classLine} />
                  <ThemedText style={[styles.classTagText, { color: '#F59E0B' }]}>
                    F · FIRST
                  </ThemedText>
                  <View style={styles.classLine} />
                </View>

                <View style={styles.firstHeaderRow}>
                  <ThemedText style={styles.colHeadLabel}>A</ThemedText>
                  <View style={styles.firstCenterCols}>
                    <ThemedText style={styles.colHeadLabel}>D</ThemedText>
                    <ThemedText style={styles.colHeadLabel}>E</ThemedText>
                  </View>
                  <ThemedText style={styles.colHeadLabel}>J</ThemedText>
                </View>

                {FIRST_ROWS.map((row) => (
                  <View key={`f-${row}`} style={styles.rowWrap}>
                    <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                    <View style={styles.firstRowInner}>
                      {renderFirstSeat(`${row}A`)}
                      <View style={styles.firstCenterCols}>
                        {renderFirstSeat(`${row}D`)}
                        {renderFirstSeat(`${row}E`)}
                      </View>
                      {renderFirstSeat(`${row}J`)}
                    </View>
                  </View>
                ))}
              </View>

              {/* ── C: 비즈니스 클래스 앞 구역 (7–8열, 2-3-2) ── */}
              <View style={styles.sectionBlock}>
                <View style={styles.classBadgeRow}>
                  <View style={styles.classLine} />
                  <ThemedText style={[styles.classTagText, { color: '#60A5FA' }]}>
                    C · BUSINESS
                  </ThemedText>
                  <View style={styles.classLine} />
                </View>

                <View style={styles.bizHeaderRow}>
                  <View style={styles.bizSidePair}>
                    <ThemedText style={styles.colHeadSmall}>A</ThemedText>
                    <ThemedText style={styles.colHeadSmall}>B</ThemedText>
                  </View>
                  <View style={styles.bizCenterTri}>
                    <ThemedText style={styles.colHeadSmall}>D</ThemedText>
                    <ThemedText style={styles.colHeadSmall}>E</ThemedText>
                    <ThemedText style={styles.colHeadSmall}>F</ThemedText>
                  </View>
                  <View style={styles.bizSidePair}>
                    <ThemedText style={styles.colHeadSmall}>H</ThemedText>
                    <ThemedText style={styles.colHeadSmall}>J</ThemedText>
                  </View>
                </View>

                {BUSINESS_FRONT_ROWS.map((row) => (
                  <View key={`bf-${row}`} style={styles.rowWrap}>
                    <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                    <View style={styles.bizRowInner}>
                      <View style={styles.bizSidePair}>
                        {renderBusinessSeat(`${row}A`)}
                        {renderBusinessSeat(`${row}B`)}
                      </View>
                      <View style={[styles.bizCenterTri, styles.bizCenterStagger]}>
                        {renderBusinessSeat(`${row}D`)}
                        {renderBusinessSeat(`${row}E`)}
                        {renderBusinessSeat(`${row}F`)}
                      </View>
                      <View style={styles.bizSidePair}>
                        {renderBusinessSeat(`${row}H`)}
                        {renderBusinessSeat(`${row}J`)}
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <ExitRow />
              <View style={styles.facilitySpreadRow}>
                <FacilityPill label="WC" />
                <FacilityPill isGalley />
                <FacilityPill label="WC" />
              </View>

              {/* ── C: 비즈니스 클래스 뒤 구역 (9–15열, 2-3-2) ── */}
              <View style={styles.sectionBlock}>
                {BUSINESS_REAR_ROWS.map((row) => (
                  <View key={`br-${row}`} style={styles.rowWrap}>
                    <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                    <View style={styles.bizRowInner}>
                      <View style={styles.bizSidePair}>
                        {renderBusinessSeat(`${row}A`)}
                        {renderBusinessSeat(`${row}B`)}
                      </View>
                      <View style={[styles.bizCenterTri, styles.bizCenterStagger]}>
                        {renderBusinessSeat(`${row}D`)}
                        {renderBusinessSeat(`${row}E`)}
                        {renderBusinessSeat(`${row}F`)}
                      </View>
                      <View style={styles.bizSidePair}>
                        {renderBusinessSeat(`${row}H`)}
                        {renderBusinessSeat(`${row}J`)}
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <ExitRow />

              {/* ── Y: 이코노미 클래스 앞 구역 (28–40열, 3-3-3) ── */}
              <View style={styles.sectionBlock}>
                <View style={styles.classBadgeRow}>
                  <View style={styles.classLine} />
                  <ThemedText style={[styles.classTagText, { color: '#38BDF8' }]}>
                    Y · ECONOMY
                  </ThemedText>
                  <View style={styles.classLine} />
                </View>

                <View style={styles.ecoHeaderRow}>
                  <View style={styles.ecoGroup}>
                    <ThemedText style={styles.colHeadTiny}>A</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>B</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>C</ThemedText>
                  </View>
                  <View style={styles.ecoGroup}>
                    <ThemedText style={styles.colHeadTiny}>D</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>E</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>F</ThemedText>
                  </View>
                  <View style={styles.ecoGroup}>
                    <ThemedText style={styles.colHeadTiny}>G</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>H</ThemedText>
                    <ThemedText style={styles.colHeadTiny}>J</ThemedText>
                  </View>
                </View>

                {ECONOMY_FRONT_ROWS.map((row) => {
                  const preferred = row <= 31;
                  return (
                    <View key={`ef-${row}`} style={styles.rowWrap}>
                      <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                      <View style={styles.ecoRowInner}>
                        <View style={styles.ecoGroup}>
                          {renderEconomySeat(`${row}A`, preferred)}
                          {renderEconomySeat(`${row}B`, preferred)}
                          {renderEconomySeat(`${row}C`, preferred)}
                        </View>
                        <View style={styles.ecoGroup}>
                          {renderEconomySeat(`${row}D`, preferred)}
                          {renderEconomySeat(`${row}E`, preferred)}
                          {renderEconomySeat(`${row}F`, preferred)}
                        </View>
                        <View style={styles.ecoGroup}>
                          {renderEconomySeat(`${row}G`, preferred)}
                          {renderEconomySeat(`${row}H`, preferred)}
                          {renderEconomySeat(`${row}J`, preferred)}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.facilitySpreadRow}>
                <FacilityPill label="WC" />
                <FacilityPill isGalley />
                <FacilityPill label="WC" />
              </View>
              <ExitRow />

              {/* ── Y: 이코노미 클래스 뒤 구역 (41–51열 3-3-3, 52–53열 2-3-2) ── */}
              <View style={styles.sectionBlock}>
                {ECONOMY_REAR_ROWS.map((row) => (
                  <View key={`er-${row}`} style={styles.rowWrap}>
                    <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                    <View style={styles.ecoRowInner}>
                      <View style={styles.ecoGroup}>
                        {renderEconomySeat(`${row}A`)}
                        {renderEconomySeat(`${row}B`)}
                        {renderEconomySeat(`${row}C`)}
                      </View>
                      <View style={styles.ecoGroup}>
                        {renderEconomySeat(`${row}D`)}
                        {renderEconomySeat(`${row}E`)}
                        {renderEconomySeat(`${row}F`)}
                      </View>
                      <View style={styles.ecoGroup}>
                        {renderEconomySeat(`${row}G`)}
                        {renderEconomySeat(`${row}H`)}
                        {renderEconomySeat(`${row}J`)}
                      </View>
                    </View>
                  </View>
                ))}

                {ECONOMY_TAIL_ROWS.map((row) => (
                  <View key={`et-${row}`} style={styles.rowWrap}>
                    <ThemedText style={styles.rowNumLeft}>{row}</ThemedText>
                    <View style={styles.ecoRowInner}>
                      <View style={styles.ecoTailSide}>
                        {renderEconomySeat(`${row}A`)}
                        {renderEconomySeat(`${row}B`)}
                      </View>
                      <View style={styles.ecoGroup}>
                        {renderEconomySeat(`${row}D`)}
                        {renderEconomySeat(`${row}E`)}
                        {renderEconomySeat(`${row}F`)}
                      </View>
                      <View style={styles.ecoTailSide}>
                        {renderEconomySeat(`${row}H`)}
                        {renderEconomySeat(`${row}J`)}
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <ExitRow />
              <View style={styles.facilitySpreadRow}>
                <FacilityPill label="WC" />
                <FacilityPill isGalley />
                <FacilityPill label="WC" />
              </View>
            </View>
          </View>

          {/* 3. 샤프한 테이퍼드 꼬리 + 후퇴 수평 꼬리 날개 + 수직 꼬리 날개 */}
          <View style={styles.tailSvgWrap}>
            <Svg width={tailWidth} height={116} viewBox={`0 0 ${tailWidth} 116`}>
              {/* 왼쪽 수평 꼬리 날개 */}
              <Path
                d={`M ${tailCx - 34} 44 L ${tailCx - tailWingOut} 90 L ${tailCx - tailWingOut} 104 L ${tailCx - 18} 86 Z`}
                fill={wingFill}
                stroke={hullStroke}
                strokeWidth={1.2}
              />
              {/* 오른쪽 수평 꼬리 날개 */}
              <Path
                d={`M ${tailCx + 34} 44 L ${tailCx + tailWingOut} 90 L ${tailCx + tailWingOut} 104 L ${tailCx + 18} 86 Z`}
                fill={wingFill}
                stroke={hullStroke}
                strokeWidth={1.2}
              />
              {/* 뾰족하게 좁아지는 테이퍼드 꼬리 동체 */}
              <Path
                d={`M ${tailCx - 124} 0 C ${tailCx - 116} 42, ${tailCx - 68} 86, ${tailCx - 4} 112 Q ${tailCx} 114 ${tailCx + 4} 112 C ${tailCx + 68} 86, ${tailCx + 116} 42, ${tailCx + 124} 0 Z`}
                fill={hullFill}
                stroke={hullStroke}
                strokeWidth={1.5}
              />
              {/* 중앙 수직 꼬리 날개 능선 */}
              <Path
                d={`M ${tailCx} 36 L ${tailCx - 4} 108 L ${tailCx} 112 L ${tailCx + 4} 108 Z`}
                fill="#1E293B"
                stroke={hullStroke}
                strokeWidth={1}
              />
            </Svg>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const BARCODE_WIDTHS = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1, 2, 1, 3, 1, 2, 1, 2, 3, 1, 2];

/**
 * 비행 시작 시 탑승권(티켓)이 절취선을 따라 찢어지며 비행이 시작되는 오버레이 애니메이션.
 */
export function BoardingPassTearOverlay({
  visible,
  route,
  seat,
  subjectName,
  totalMinutes,
  modeLabel,
  onComplete,
}: {
  visible: boolean;
  route: FlightRoute;
  seat: string;
  subjectName: string | null;
  totalMinutes: number;
  modeLabel: string;
  onComplete: () => void;
}) {
  const [overlayOpacity] = useState(() => new Animated.Value(0));
  const [cardScale] = useState(() => new Animated.Value(0.9));
  const [topLift] = useState(() => new Animated.Value(0));
  const [stubDrop] = useState(() => new Animated.Value(0));
  const [stubShift] = useState(() => new Animated.Value(0));
  const [stubRotate] = useState(() => new Animated.Value(0));
  const [stubOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!visible) {
      overlayOpacity.setValue(0);
      cardScale.setValue(0.9);
      topLift.setValue(0);
      stubDrop.setValue(0);
      stubShift.setValue(0);
      stubRotate.setValue(0);
      stubOpacity.setValue(1);
      return;
    }

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          damping: 16,
          stiffness: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(topLift, {
          toValue: -10,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stubDrop, {
          toValue: 74,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stubShift, {
          toValue: 18,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(stubRotate, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(stubOpacity, {
          toValue: 0,
          duration: 480,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    anim.start(({ finished }) => {
      if (finished) onComplete();
    });

    return () => anim.stop();
  }, [
    visible,
    overlayOpacity,
    cardScale,
    topLift,
    stubDrop,
    stubShift,
    stubRotate,
    stubOpacity,
    onComplete,
  ]);

  if (!visible) return null;

  const rotateDeg = stubRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '9deg'],
  });

  const classHeaderColor =
    seatClassCode(seat) === 'FIRST'
      ? '#B45309'
      : seatClassCode(seat) === 'BUSINESS'
        ? '#1E3A8A'
        : '#1D4ED8';

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View style={[styles.ticketWrap, { transform: [{ scale: cardScale }] }]}>
        {/* 탑승권 상단 (본권) */}
        <Animated.View style={[styles.ticketTop, { transform: [{ translateY: topLift }] }]}>
          <View style={[styles.ticketHeader, { backgroundColor: classHeaderColor }]}>
            <View style={styles.ticketBrand}>
              <Plane size={15} color="#FFFFFF" strokeWidth={2.2} />
              <ThemedText type="smallBold" style={styles.ticketHeaderText}>
                {seatClassCode(seat)} · {route.flightNo}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={styles.ticketModeBadge}>
              {modeLabel}
            </ThemedText>
          </View>

          <View style={styles.ticketBody}>
            <View style={styles.ticketRouteRow}>
              <View>
                <ThemedText style={styles.ticketCode}>{route.codeFrom}</ThemedText>
                <ThemedText type="small" style={styles.ticketCity}>
                  {route.cityFrom}
                </ThemedText>
              </View>
              <View style={styles.ticketPlaneMid}>
                <View style={styles.ticketLine} />
                <Plane size={16} color={classHeaderColor} strokeWidth={2.1} />
                <View style={styles.ticketLine} />
              </View>
              <View style={styles.ticketRight}>
                <ThemedText style={styles.ticketCode}>{route.codeTo}</ThemedText>
                <ThemedText type="small" style={styles.ticketCity}>
                  {route.cityTo}
                </ThemedText>
              </View>
            </View>

            <View style={styles.ticketMetaGrid}>
              <View style={styles.ticketMetaCol}>
                <ThemedText style={styles.ticketMetaLabel}>SEAT</ThemedText>
                <ThemedText style={styles.ticketMetaVal}>
                  {seat} · {seatPositionLabel(seat)}
                </ThemedText>
              </View>
              <View style={styles.ticketMetaCol}>
                <ThemedText style={styles.ticketMetaLabel}>CLASS</ThemedText>
                <ThemedText style={styles.ticketMetaVal}>{seatClassLabel(seat)}</ThemedText>
              </View>
              <View style={styles.ticketMetaCol}>
                <ThemedText style={styles.ticketMetaLabel}>FLIGHT</ThemedText>
                <ThemedText style={styles.ticketMetaVal}>
                  {formatFlightMinutes(totalMinutes)}
                </ThemedText>
              </View>
            </View>

            {subjectName ? (
              <ThemedText style={styles.ticketSubject}>
                PASSENGER FOCUS · {subjectName}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.tearLineWrap}>
            <View style={[styles.notch, styles.notchLeft]} />
            <View style={styles.dashedTearLine} />
            <View style={[styles.notch, styles.notchRight]} />
          </View>
        </Animated.View>

        {/* 탑승권 하단 (찢어지는 스텁) */}
        <Animated.View
          style={[
            styles.ticketStub,
            {
              opacity: stubOpacity,
              transform: [
                { translateY: stubDrop },
                { translateX: stubShift },
                { rotate: rotateDeg },
              ],
            },
          ]}>
          <View style={styles.barcodeRow}>
            {BARCODE_WIDTHS.map((w, idx) => (
              <View
                key={idx}
                style={[styles.barcodeBar, { width: w * 2, marginHorizontal: 1.5 }]}
              />
            ))}
          </View>
          <ThemedText style={styles.stubLabel}>
            BOARDING · {route.flightNo} · {seatClassCode(seat)} · SEAT {seat}
          </ThemedText>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cabinCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E2638',
    backgroundColor: '#07090F',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cabinHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cabinTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  selectedSummary: {
    fontSize: 12,
    color: '#94A3B8',
  },
  planeScroll: {
    maxHeight: 430,
  },
  planeScrollDesktop: {
    maxHeight: 540,
  },
  planeScrollContent: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  planeAssembly: {
    alignItems: 'center',
    width: 312,
  },
  noseSvgWrap: {
    marginBottom: -1,
    alignItems: 'center',
  },
  fuselageOuter: {
    position: 'relative',
    width: 312,
    alignItems: 'center',
  },
  wingLeft: {
    position: 'absolute',
    left: -12,
    top: 350,
    zIndex: 1,
  },
  wingRight: {
    position: 'absolute',
    right: -12,
    top: 350,
    zIndex: 1,
  },
  wingLeftFull: {
    position: 'absolute',
    top: 340,
    zIndex: 1,
  },
  wingRightFull: {
    position: 'absolute',
    top: 340,
    zIndex: 1,
  },
  fuselageBody: {
    width: 248,
    zIndex: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  tailSvgWrap: {
    marginTop: -1,
    alignItems: 'center',
  },
  exitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginVertical: 2,
  },
  exitBadge: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  exitText: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  facilityCenterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  facilitySpreadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginVertical: 2,
  },
  facilityBox: {
    minWidth: 32,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: '#1A2233',
    borderWidth: 1,
    borderColor: '#283349',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
  },
  sectionBlock: {
    gap: 5,
  },
  classBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  classLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#253046',
  },
  classTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowNumLeft: {
    width: 16,
    fontSize: 9,
    lineHeight: 12,
    color: '#64748B',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // First Class (1-2-1)
  firstHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 4,
  },
  firstRowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  firstCenterCols: {
    flexDirection: 'row',
    gap: 6,
  },
  firstSuiteFrame: {
    width: 34,
    padding: 3,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  firstHeadrest: {
    width: 22,
    height: 4,
    borderRadius: 2,
  },
  firstSeatBody: {
    width: 26,
    height: 24,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatCodeWhite: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  colHeadLabel: {
    width: 34,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  // Business Class (2-3-2)
  bizHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 2,
  },
  bizRowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  bizSidePair: {
    flexDirection: 'row',
    gap: 3,
  },
  bizCenterTri: {
    flexDirection: 'row',
    gap: 3,
  },
  bizCenterStagger: {
    marginTop: 4,
  },
  bizSeat: {
    width: 24,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bizSeatText: {
    color: '#FFFFFF',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  colHeadSmall: {
    width: 24,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  // Economy Class (3-3-3)
  ecoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 2,
  },
  ecoRowInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 2,
  },
  ecoGroup: {
    flexDirection: 'row',
    gap: 2.5,
  },
  ecoTailSide: {
    width: 60,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  ecoSeat: {
    width: 18.5,
    height: 18,
    borderRadius: 3.5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ecoSeatText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  colHeadTiny: {
    width: 18.5,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  // Boarding pass tear overlay
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 60,
    backgroundColor: 'rgba(6, 9, 17, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  ticketWrap: {
    width: '100%',
    maxWidth: 340,
  },
  ticketTop: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  ticketHeader: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  ticketModeBadge: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
  },
  ticketBody: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  ticketRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  ticketCode: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 1,
  },
  ticketCity: {
    color: '#64748B',
  },
  ticketRight: {
    alignItems: 'flex-end',
  },
  ticketPlaneMid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#CBD5E1',
  },
  ticketMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  ticketMetaCol: {
    gap: 2,
  },
  ticketMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  ticketMetaVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  ticketSubject: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  tearLineWrap: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  dashedTearLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    marginHorizontal: 12,
  },
  notch: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(6, 9, 17, 0.78)',
  },
  notchLeft: {
    left: -9,
  },
  notchRight: {
    right: -9,
  },
  ticketStub: {
    backgroundColor: '#F8FAFC',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  barcodeBar: {
    height: 30,
    backgroundColor: '#0F172A',
    borderRadius: 1,
  },
  stubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.8,
  },
});
