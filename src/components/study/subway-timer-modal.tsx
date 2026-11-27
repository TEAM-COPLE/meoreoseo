import * as ScreenOrientation from 'expo-screen-orientation';
import {
  ArrowLeftRight,
  CheckCircle2,
  Columns2,
  Play,
  Radio,
  Rows2,
  Search,
  Square,
  TrainFront,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { formatClock, formatDuration } from '@/lib/study';

import { ArrivalOverlay } from './arrival-overlay';
import { FadeSlideIn } from './common';
import { formatAtcTimestamp } from './flight-atc';
import {
  ALL_STATIONS,
  findSubwayPath,
  formatStationName,
  getSubwayLine,
  SUBWAY_LINES,
  withEuro,
} from './subway-data';

type Props = {
  visible: boolean;
  running: boolean;
  startedAt?: number | null;
  elapsedSeconds: number;
  subjectName: string | null;
  subjectColor: string;
  busy?: boolean;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
};

/**
 * 수도권 24개 노선 지하철 타이머 모달.
 * 출발역과 종착역을 고르면 최단 경로(환승 포함)를 계산해
 * 열차 내 LCD 전광판처럼 현재역·다음역·남은 정거장·안내방송을 실시간으로 보여 준다.
 */
export function SubwayTimerModal({
  visible,
  running,
  startedAt = null,
  elapsedSeconds,
  subjectName,
  subjectColor,
  busy = false,
  onStart,
  onStop,
  onClose,
}: Props) {
  const theme = useTheme();
  const { resolvedScheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [startStation, setStartStation] = useState('서울역');
  const [endStation, setEndStation] = useState('강남');
  const [pickingSlot, setPickingSlot] = useState<'start' | 'end' | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>('line2');
  const [query, setQuery] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [landscapeOverride, setLandscapeOverride] = useState<boolean | null>(null);
  const [dismissedArrivalKey, setDismissedArrivalKey] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const isLandscape = landscapeOverride ?? width > height;

  // 지하철 타이머가 열려 있는 동안 가로 회전을 허용하고, 닫으면 다시 세로로 되돌린다.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (visible) {
      ScreenOrientation.unlockAsync().catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [visible]);

  function handleToggleOrientation() {
    const nextLandscape = !isLandscape;
    if (Platform.OS !== 'web') {
      setLandscapeOverride(null);
      ScreenOrientation.lockAsync(
        nextLandscape
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => {
        setLandscapeOverride(nextLandscape);
      });
      return;
    }
    setLandscapeOverride(nextLandscape);
  }

  const path = useMemo(
    () => findSubwayPath(startStation, endStation),
    [startStation, endStation],
  );

  const totalSeconds = path?.totalSeconds ?? 0;
  const activeElapsed = running ? elapsedSeconds : 0;
  const progress = totalSeconds > 0 ? Math.min(1, activeElapsed / totalSeconds) : 0;
  const remaining = Math.max(0, totalSeconds - activeElapsed);
  const arrived = running && totalSeconds > 0 && activeElapsed >= totalSeconds;
  const displayedElapsed = arrived ? totalSeconds : activeElapsed;
  const percent = Math.min(100, Math.round(progress * 100));
  const arrivalKey = `${startedAt ?? 0}:${startStation}:${endStation}`;
  const showArrivalOverlay = arrived && dismissedArrivalKey !== arrivalKey;

  // 현재 경과 시간 기준으로 어느 역에 위치해 있는지 계산
  const currentIndex = useMemo(() => {
    if (!path || path.steps.length === 0) return 0;
    if (!running) return 0;
    if (arrived) return path.steps.length - 1;
    let idx = 0;
    for (let i = 0; i < path.steps.length; i++) {
      if (path.steps[i].cumulativeSeconds <= activeElapsed) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [path, running, arrived, activeElapsed]);

  const currentStep = path?.steps[currentIndex] ?? null;
  const nextStep = path && currentIndex < path.steps.length - 1 ? path.steps[currentIndex + 1] : null;
  const destinationStep = path && path.steps.length > 0 ? path.steps[path.steps.length - 1] : null;
  const passedStops = running ? currentIndex : 0;
  const remainingStops = path ? Math.max(0, path.stopsCount - passedStops) : 0;
  const activeLineColor = currentStep?.lineColor ?? '#00A84D';
  const destinationLineColor = destinationStep?.lineColor ?? activeLineColor;
  const destinationLineName = destinationStep?.lineName ?? '수도권 전철';

  // 현재 역 → 다음 역 구간 진행률(0~1)
  const segStart = currentStep?.cumulativeSeconds ?? 0;
  const segEnd = nextStep?.cumulativeSeconds ?? segStart;
  const segProgress =
    running && !arrived && nextStep && segEnd > segStart
      ? Math.max(0, Math.min(1, (activeElapsed - segStart) / (segEnd - segStart)))
      : 0;
  const isMovingToNext = running && !arrived && nextStep !== null;

  const announceBaseMs = running && startedAt ? startedAt : openedAt;
  const announceTimestamp = formatAtcTimestamp(
    running
      ? announceBaseMs + (arrived ? totalSeconds : (currentStep?.cumulativeSeconds ?? 0)) * 1000
      : announceBaseMs,
  );

  const stationLineLookup = useMemo(
    () => new Map(ALL_STATIONS.map((s) => [s.name, s.lineIds])),
    [],
  );

  // 노선 필터 + 역명 검색 결과
  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (selectedLineId !== 'all') {
      const line = getSubwayLine(selectedLineId);
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const branch of line.branches) {
        for (const st of branch) {
          if (!seen.has(st)) {
            seen.add(st);
            ordered.push(st);
          }
        }
      }
      return ordered
        .filter((name) => (!q ? true : name.toLowerCase().includes(q)))
        .map((name) => ({
          name,
          lineIds: stationLineLookup.get(name) ?? [selectedLineId],
        }));
    }
    return ALL_STATIONS.filter((s) =>
      !q ? true : s.name.toLowerCase().includes(q),
    );
  }, [selectedLineId, query, stationLineLookup]);

  const activePickerLine =
    selectedLineId !== 'all' && query.trim() === ''
      ? getSubwayLine(selectedLineId)
      : null;

  function swapStations() {
    setStartStation(endStation);
    setEndStation(startStation);
  }

  function pickStation(name: string) {
    if (pickingSlot === 'start') {
      if (name === endStation) setEndStation(startStation);
      setStartStation(name);
    } else if (pickingSlot === 'end') {
      if (name === startStation) setStartStation(endStation);
      setEndStation(name);
    }
    setPickingSlot(null);
    setQuery('');
  }

  const isDark = resolvedScheme === 'dark';
  const lcdBg = isDark ? '#090B10' : '#11131A';
  const lcdBorder = isDark ? '#1F2430' : '#232734';
  const accent = '#FFFFFF';
  const accentMuted = 'rgba(255, 255, 255, 0.58)';

  const statusText = arrived
    ? '종착역 도착'
    : running
      ? nextStep?.isTransfer
        ? '환승역 접근'
        : '운행 중'
      : '승차 대기';

  const announcementText = useMemo(() => {
    if (!path || !currentStep) return '출발역과 종착역을 선택해 주세요.';
    if (!running) {
      return `잠시 후 ${formatStationName(startStation)}에서 ${endStation}행 ${currentStep.lineName} 열차가 출발합니다.`;
    }
    if (arrived) {
      return `종착역인 ${formatStationName(endStation)}에 도착했습니다. 잊으신 물건이 없는지 확인하시고 하차해 주세요.`;
    }
    if (nextStep) {
      const transferHint = nextStep.isTransfer
        ? ` ${withEuro(nextStep.lineName)} 갈아타실 수 있습니다.`
        : '';
      const cleanNext = nextStep.station.replace(/\([^)]*\)$/, '').trim();
      return `이번 역은 ${cleanNext}, ${formatStationName(nextStep.station)}입니다. 내리실 문은 오른쪽입니다.${transferHint}`;
    }
    return `이번 역은 ${formatStationName(currentStep.station)}입니다.`;
  }, [path, currentStep, nextStep, running, arrived, startStation, endStation]);

  const lcdDisplaySection = (
    <>
      {/* 열차 내 LCD 전광판 카드 */}
      <View style={[styles.lcdCard, { backgroundColor: lcdBg, borderColor: lcdBorder }]}>
        {/* 상단 노선 컬러 띠 */}
        <View style={[styles.lineBanner, { backgroundColor: activeLineColor }]}>
          <View style={styles.bannerLeft}>
            <View style={styles.linePillWhite}>
              <ThemedText
                type="smallBold"
                style={{ color: activeLineColor, fontSize: 12 }}>
                {currentStep?.lineName ?? '수도권 전철'}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
              {endStation}행
            </ThemedText>
            {subjectName ? (
              <View style={styles.bannerSubject}>
                <View style={[styles.subjectDot, { backgroundColor: subjectColor }]} />
                <ThemedText type="small" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12 }}>
                  {subjectName}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <View style={styles.bannerStatus}>
            {arrived ? <CheckCircle2 size={12} color="#FFFFFF" strokeWidth={2.4} /> : null}
            <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 12 }}>
              {statusText}
            </ThemedText>
          </View>
        </View>

        <View style={styles.lcdBody}>
          {/* 현재역 / 다음역 대형 표시 + 다음역 이동 애니메이션 */}
          <View style={styles.stationHero}>
            <View style={styles.heroCol}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                {running ? (arrived ? '도착역' : '현재 역') : '출발역'}
              </ThemedText>
              <ThemedText style={[styles.heroStationName, { color: accent }]} numberOfLines={1}>
                {currentStep?.station ?? startStation}
              </ThemedText>
            </View>

            {isMovingToNext ? (
              <View style={styles.movingIndicator}>
                <ThemedText style={[styles.movingLabel, { color: accentMuted }]}>
                  이동 중 · {Math.round(segProgress * 100)}%
                </ThemedText>
              </View>
            ) : null}

            <View style={styles.heroRight}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                {nextStep ? '다음 역' : '종착역'}
              </ThemedText>
              <ThemedText
                type="default"
                style={[styles.heroNextName, { color: activeLineColor }]}
                numberOfLines={1}>
                {nextStep ? nextStep.station : endStation}
              </ThemedText>
            </View>
          </View>

          {/* 진행률 바 */}
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${percent}%`,
                    backgroundColor: arrived ? theme.success : activeLineColor,
                  },
                ]}
              />
            </View>
            <ThemedText type="smallBold" style={{ color: accentMuted, fontSize: 12 }}>
              {percent}%
            </ThemedText>
          </View>

          {/* 가로 노선도 트랙 */}
          {path ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trackRow}>
              {path.steps.map((step, idx) => {
                const isPassed = running && idx < currentIndex;
                const isCurrent = idx === currentIndex;
                const isLast = idx === path.steps.length - 1;
                return (
                  <View key={`${step.station}-${idx}`} style={styles.trackNode}>
                    <View style={styles.trackLineRow}>
                      <View
                        style={[
                          styles.trackSeg,
                          {
                            backgroundColor:
                              idx === 0
                                ? 'transparent'
                                : isPassed || isCurrent
                                  ? step.lineColor
                                  : 'rgba(255,255,255,0.2)',
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.stationDot,
                          {
                            backgroundColor: isCurrent
                              ? '#FFFFFF'
                              : isPassed
                                ? step.lineColor
                                : lcdBg,
                            borderColor: step.lineColor,
                            borderWidth: isCurrent ? 3 : 2,
                            width: isCurrent ? 20 : 12,
                            height: isCurrent ? 20 : 12,
                          },
                        ]}>
                        {isCurrent ? (
                          <TrainFront size={11} color={step.lineColor} strokeWidth={2.4} />
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.trackSeg,
                          {
                            backgroundColor: isLast
                              ? 'transparent'
                              : isPassed
                                ? path.steps[idx + 1]?.lineColor ?? step.lineColor
                                : 'rgba(255,255,255,0.2)',
                          },
                        ]}>
                        {isCurrent && isMovingToNext ? (
                          <View
                            style={[
                              styles.trackSegFill,
                              {
                                width: `${Math.round(segProgress * 100)}%`,
                                backgroundColor: path.steps[idx + 1]?.lineColor ?? step.lineColor,
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                    </View>
                    <ThemedText
                      type={isCurrent ? 'smallBold' : 'small'}
                      numberOfLines={1}
                      style={{
                        color: isCurrent ? '#FFFFFF' : isPassed ? accentMuted : '#CBD5E1',
                        fontSize: 11,
                        maxWidth: 68,
                        textAlign: 'center',
                      }}>
                      {step.station}
                    </ThemedText>
                    {step.isTransfer ? (
                      <View
                        style={[
                          styles.transferBadge,
                          { backgroundColor: `${step.lineColor}33`, borderColor: step.lineColor },
                        ]}>
                        <ThemedText
                          style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>
                          환승·{getSubwayLine(step.lineId).shortName}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <ThemedText type="small" style={{ color: theme.danger }}>
              연결된 경로를 찾을 수 없는 역 조합입니다. (예: GTX-A 남부·북부 분리 구간)
            </ThemedText>
          )}

          {/* 시간 & 정거장 계기판 */}
          <View style={[styles.telemetryRow, { borderTopColor: lcdBorder }]}>
            <View style={styles.telemetryItem}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                경과 시간
              </ThemedText>
              <ThemedText style={[styles.telemetryValue, { color: accent }]}>
                {formatClock(displayedElapsed)}
              </ThemedText>
            </View>
            <View style={styles.telemetryItem}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                남은 시간
              </ThemedText>
              <ThemedText
                style={[
                  styles.telemetryValue,
                  { color: arrived ? theme.success : accent },
                ]}>
                {arrived ? '00:00:00' : `-${formatClock(remaining)}`}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.telemetryRow, { borderTopColor: lcdBorder }]}>
            <View style={styles.telemetryItem}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                지나온 역
              </ThemedText>
              <ThemedText style={[styles.telemetryValue, { color: accent }]}>
                {passedStops}개역
              </ThemedText>
            </View>
            <View style={styles.telemetryItem}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                남은 역
              </ThemedText>
              <ThemedText style={[styles.telemetryValue, { color: activeLineColor }]}>
                {remainingStops}개역
              </ThemedText>
            </View>
            <View style={styles.telemetryItem}>
              <ThemedText type="small" style={{ color: accentMuted }}>
                총 정거장 · 환승
              </ThemedText>
              <ThemedText style={[styles.telemetryValue, { color: accentMuted }]}>
                {path ? `${path.stopsCount}역 · ${path.transferCount}회` : '-'}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* 실시간 안내방송 */}
      {showAnnouncement ? (
        <View style={[styles.announceCard, { backgroundColor: lcdBg, borderColor: lcdBorder }]}>
          <View style={styles.announceHeader}>
            <Radio size={14} color={activeLineColor} strokeWidth={2.2} />
            <ThemedText type="smallBold" style={{ color: accent }}>
              열차 안내방송
            </ThemedText>
          </View>
          <FadeSlideIn
            key={`${running}:${arrived}:${currentIndex}:${startStation}:${endStation}`}>
            <View style={styles.announceContent}>
              <ThemedText type="small" style={[styles.announceTimestamp, { color: accentMuted }]}>
                {announceTimestamp}
              </ThemedText>
              <ThemedText type="small" style={{ color: '#E2E8F0', lineHeight: 20 }}>
                &ldquo;{announcementText}&rdquo;
              </ThemedText>
            </View>
          </FadeSlideIn>
        </View>
      ) : null}
    </>
  );

  const controlsSection = (
    <>
      {/* 출발역 ↔ 종착역 선택 */}
      <View style={styles.pickerSection}>
        <View style={styles.pickerHeader}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            출발역 · 종착역 선택
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {SUBWAY_LINES.length}개 노선 · {ALL_STATIONS.length}개 역
          </ThemedText>
        </View>

        <View style={styles.slotRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="출발역 고르기"
            onPress={() => setPickingSlot(pickingSlot === 'start' ? null : 'start')}
            style={({ pressed }) => [
              styles.slotCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: pickingSlot === 'start' ? theme.tint : theme.border,
                borderWidth: pickingSlot === 'start' ? 1.5 : 1,
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              출발역
            </ThemedText>
            <ThemedText type="default" style={styles.slotValue} numberOfLines={1}>
              {startStation}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="출발역과 종착역 바꾸기"
            hitSlop={8}
            onPress={swapStations}
            style={({ pressed }) => [
              styles.swapBtn,
              {
                backgroundColor: theme.backgroundSelected,
                borderColor: theme.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ArrowLeftRight size={16} color={theme.text} strokeWidth={2} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="종착역 고르기"
            onPress={() => setPickingSlot(pickingSlot === 'end' ? null : 'end')}
            style={({ pressed }) => [
              styles.slotCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: pickingSlot === 'end' ? theme.tint : theme.border,
                borderWidth: pickingSlot === 'end' ? 1.5 : 1,
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              종착역
            </ThemedText>
            <ThemedText type="default" style={styles.slotValue} numberOfLines={1}>
              {endStation}
            </ThemedText>
          </Pressable>
        </View>

        {/* 역 선택 패널 (출발역 또는 종착역을 누르면 펼쳐짐) */}
        {pickingSlot ? (
          <View
            style={[
              styles.stationPickerPanel,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <ThemedText type="smallBold">
              {pickingSlot === 'start' ? '출발역' : '종착역'}을 골라 주세요
            </ThemedText>

            <View
              style={[
                styles.searchRow,
                { backgroundColor: theme.background, borderColor: theme.border },
              ]}>
              <Search size={15} color={theme.textSecondary} strokeWidth={1.9} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="역 이름 검색 (예: 강남, 홍대입구, 판교)"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                style={[styles.searchInput, { color: theme.text }]}
              />
              {query.length > 0 ? (
                <Pressable hitSlop={8} onPress={() => setQuery('')}>
                  <X size={14} color={theme.textSecondary} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            {/* 24개 노선 필터 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.lineFilterRow}>
              <Pressable
                onPress={() => setSelectedLineId('all')}
                style={[
                  styles.lineFilterChip,
                  {
                    backgroundColor:
                      selectedLineId === 'all' ? theme.tint : theme.background,
                    borderColor:
                      selectedLineId === 'all' ? theme.tint : theme.border,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{
                    color: selectedLineId === 'all' ? theme.onTint : theme.textSecondary,
                    fontSize: 12,
                  }}>
                  전체 ({ALL_STATIONS.length})
                </ThemedText>
              </Pressable>

              {SUBWAY_LINES.map((line) => {
                const active = selectedLineId === line.id;
                return (
                  <Pressable
                    key={line.id}
                    onPress={() => setSelectedLineId(line.id)}
                    style={[
                      styles.lineFilterChip,
                      {
                        backgroundColor: active ? line.color : theme.background,
                        borderColor: active ? line.color : theme.border,
                      },
                    ]}>
                    {!active ? (
                      <View style={[styles.lineColorDot, { backgroundColor: line.color }]} />
                    ) : null}
                    <ThemedText
                      type="smallBold"
                      style={{
                        color: active ? '#FFFFFF' : theme.text,
                        fontSize: 12,
                      }}>
                      {line.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* 역 목록 (노선 선택 시 세로 노선도 라인으로 연결 표시) */}
            <ScrollView
              nestedScrollEnabled
              style={styles.stationListScroll}
              contentContainerStyle={
                activePickerLine ? styles.verticalLineList : styles.stationGrid
              }
              showsVerticalScrollIndicator={false}>
              {activePickerLine ? (
                activePickerLine.branches.map((branch, branchIdx) => (
                  <View key={`${activePickerLine.id}-b-${branchIdx}`} style={styles.branchGroup}>
                    {activePickerLine.branches.length > 1 ? (
                      <ThemedText
                        type="smallBold"
                        themeColor="textSecondary"
                        style={styles.branchTitle}>
                        {branchIdx === 0 ? '본선' : `지선 ${branchIdx}`}
                      </ThemedText>
                    ) : null}

                    {branch.map((stationName, stIdx) => {
                      const isFirst = stIdx === 0;
                      const isLast = stIdx === branch.length - 1;
                      const isStart = stationName === startStation;
                      const isEnd = stationName === endStation;
                      const isPicked =
                        (pickingSlot === 'start' && isStart) ||
                        (pickingSlot === 'end' && isEnd);
                      const transferIds = (stationLineLookup.get(stationName) ?? []).filter(
                        (lid) => lid !== activePickerLine.id,
                      );

                      return (
                        <Pressable
                          key={`${branchIdx}-${stationName}-${stIdx}`}
                          onPress={() => pickStation(stationName)}
                          style={({ pressed }) => [
                            styles.vLineRow,
                            { opacity: pressed ? 0.72 : 1 },
                          ]}>
                          {/* 왼쪽 세로 노선 연결선 + 역 원형 노드 */}
                          <View style={styles.vTrackCol}>
                            <View
                              style={[
                                styles.vTrackSeg,
                                {
                                  backgroundColor: isFirst
                                    ? 'transparent'
                                    : activePickerLine.color,
                                },
                              ]}
                            />
                            <View
                              style={[
                                styles.vStationNode,
                                {
                                  borderColor: activePickerLine.color,
                                  backgroundColor: isPicked
                                    ? activePickerLine.color
                                    : theme.backgroundElement,
                                  width: isPicked ? 16 : 12,
                                  height: isPicked ? 16 : 12,
                                  borderWidth: isPicked ? 3 : 2.5,
                                },
                              ]}
                            />
                            <View
                              style={[
                                styles.vTrackSeg,
                                {
                                  backgroundColor: isLast
                                    ? 'transparent'
                                    : activePickerLine.color,
                                },
                              ]}
                            />
                          </View>

                          {/* 역 이름 (선택된 역은 노선 색 알약 강조) */}
                          <View style={styles.vStationBody}>
                            <View
                              style={[
                                styles.vStationNameWrap,
                                isPicked && {
                                  backgroundColor: activePickerLine.color,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  borderRadius: Radius.full,
                                },
                              ]}>
                              <ThemedText
                                type={isPicked || isStart || isEnd ? 'smallBold' : 'small'}
                                numberOfLines={1}
                                style={{
                                  color: isPicked ? '#FFFFFF' : theme.text,
                                  fontSize: 13,
                                }}>
                                {stationName}
                              </ThemedText>
                            </View>

                            {isStart ? (
                              <View
                                style={[
                                  styles.roleTag,
                                  {
                                    backgroundColor: `${activePickerLine.color}22`,
                                    borderColor: activePickerLine.color,
                                  },
                                ]}>
                                <ThemedText
                                  style={{
                                    color: activePickerLine.color,
                                    fontSize: 10,
                                    fontWeight: '700',
                                  }}>
                                  출발
                                </ThemedText>
                              </View>
                            ) : null}
                            {isEnd ? (
                              <View
                                style={[
                                  styles.roleTag,
                                  {
                                    backgroundColor: `${activePickerLine.color}22`,
                                    borderColor: activePickerLine.color,
                                  },
                                ]}>
                                <ThemedText
                                  style={{
                                    color: activePickerLine.color,
                                    fontSize: 10,
                                    fontWeight: '700',
                                  }}>
                                  종착
                                </ThemedText>
                              </View>
                            ) : null}
                          </View>

                          {/* 오른쪽 환승 노선 배지 */}
                          {transferIds.length > 0 ? (
                            <View style={styles.transferRow}>
                              {transferIds.slice(0, 4).map((lid) => {
                                const tLine = getSubwayLine(lid);
                                return (
                                  <View
                                    key={lid}
                                    style={[
                                      styles.transferCircle,
                                      { backgroundColor: tLine.color },
                                    ]}>
                                    <ThemedText style={styles.transferCircleText} numberOfLines={1}>
                                      {tLine.shortName}
                                    </ThemedText>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              ) : filteredStations.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  검색 결과가 없습니다.
                </ThemedText>
              ) : (
                filteredStations.map((st) => {
                  const isPicked =
                    (pickingSlot === 'start' && st.name === startStation) ||
                    (pickingSlot === 'end' && st.name === endStation);
                  return (
                    <Pressable
                      key={st.name}
                      onPress={() => pickStation(st.name)}
                      style={({ pressed }) => [
                        styles.stationChip,
                        {
                          backgroundColor: isPicked ? theme.tint : theme.background,
                          borderColor: isPicked ? theme.tint : theme.border,
                          opacity: pressed ? 0.75 : 1,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{ color: isPicked ? theme.onTint : theme.text }}>
                        {st.name}
                      </ThemedText>
                      <View style={styles.stationDotsRow}>
                        {st.lineIds.slice(0, 4).map((lid) => (
                          <View
                            key={lid}
                            style={[
                              styles.miniLineDot,
                              { backgroundColor: getSubwayLine(lid).color },
                            ]}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/* 출발 / 하차 버튼 */}
      <Pressable
        accessibilityRole="button"
        disabled={busy || !path}
        onPress={running ? onStop : onStart}
        style={({ pressed }) => [
          styles.actionBtn,
          {
            backgroundColor: running ? theme.backgroundElement : activeLineColor,
            borderColor: running ? theme.border : activeLineColor,
            opacity: busy || !path ? 0.5 : pressed ? 0.8 : 1,
          },
        ]}>
        {running ? (
          <Square size={16} color={theme.text} fill={theme.text} strokeWidth={2} />
        ) : (
          <Play size={17} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
        )}
        <ThemedText
          type="default"
          style={[styles.actionText, { color: running ? theme.text : '#FFFFFF' }]}>
          {running
            ? arrived
              ? '하차하고 공부 기록 저장하기'
              : '중도 하차하고 기록하기'
            : path
              ? `${startStation} → ${endStation} 출발 (${formatDuration(totalSeconds)})`
              : '경로를 선택해 주세요'}
        </ThemedText>
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + Spacing.two,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}>
        {/* 상단 바 */}
        <View style={styles.topBar}>
          <View style={styles.topTitleRow}>
            <TrainFront size={18} color={theme.text} strokeWidth={2} />
            <ThemedText type="default" style={styles.topTitle}>
              지하철 타이머
            </ThemedText>
          </View>

          <View style={styles.topBarActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showAnnouncement ? '안내방송 숨기기' : '안내방송 보이기'}
              accessibilityState={{ selected: showAnnouncement }}
              hitSlop={6}
              onPress={() => setShowAnnouncement((prev) => !prev)}
              style={({ pressed }) => [
                styles.topPillBtn,
                {
                  backgroundColor: showAnnouncement
                    ? theme.tint
                    : theme.backgroundElement,
                  borderColor: showAnnouncement ? theme.tint : theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Radio
                size={13}
                color={showAnnouncement ? theme.onTint : theme.textSecondary}
                strokeWidth={2}
              />
              <ThemedText
                type="smallBold"
                style={{
                  color: showAnnouncement ? theme.onTint : theme.text,
                  fontSize: 12,
                }}>
                {showAnnouncement ? '안내방송 ON' : '안내방송 OFF'}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isLandscape ? '세로 모드로 전환' : '가로 모드로 전환'}
              hitSlop={6}
              onPress={handleToggleOrientation}
              style={({ pressed }) => [
                styles.topPillBtn,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              {isLandscape ? (
                <Rows2 size={13} color={theme.textSecondary} strokeWidth={2} />
              ) : (
                <Columns2 size={13} color={theme.textSecondary} strokeWidth={2} />
              )}
              <ThemedText type="smallBold" style={{ fontSize: 12 }}>
                {isLandscape ? '세로' : '가로'}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="지하철 타이머 닫기"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
              ]}>
              <X size={18} color={theme.text} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        {isLandscape ? (
          /* 가로 모드: 왼쪽 LCD 전광판·안내방송, 오른쪽 역 선택·출발 제어 */
          <View style={styles.landscapeBody}>
            <ScrollView
              style={styles.landscapeMainPane}
              contentContainerStyle={styles.landscapePaneContent}
              showsVerticalScrollIndicator={false}>
              {lcdDisplaySection}
            </ScrollView>
            <ScrollView
              style={styles.landscapeSidePane}
              contentContainerStyle={styles.landscapePaneContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {controlsSection}
            </ScrollView>
          </View>
        ) : (
          /* 세로 모드 */
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {lcdDisplaySection}
            {controlsSection}
          </ScrollView>
        )}

        <ArrivalOverlay
          visible={showArrivalOverlay}
          backgroundColor={destinationLineColor}
          icon={TrainFront}
          badge={destinationLineName}
          destination={`${formatStationName(startStation)} → ${formatStationName(endStation)}`}
          saving={busy}
          onSave={() => {
            setDismissedArrivalKey(arrivalKey);
            onStop();
          }}
          onDismiss={() => setDismissedArrivalKey(arrivalKey)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  topTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topPillBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    width: '100%',
    maxWidth: 580,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  landscapeBody: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
    gap: Spacing.three,
  },
  landscapeMainPane: {
    flex: 1.15,
  },
  landscapeSidePane: {
    flex: 1,
  },
  landscapePaneContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  lcdCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  lineBanner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  linePillWhite: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  bannerSubject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subjectDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full,
  },
  bannerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  lcdBody: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  stationHero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  heroCol: {
    flex: 1,
    gap: 2,
  },
  heroRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  heroStationName: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  heroNextName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
  },
  movingIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  movingLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: Radius.full,
  },
  trackRow: {
    paddingVertical: Spacing.one,
    alignItems: 'flex-start',
  },
  trackNode: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  trackLineRow: {
    width: '100%',
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackSeg: {
    flex: 1,
    height: 3,
    overflow: 'hidden',
  },
  trackSegFill: {
    height: 3,
  },
  stationDot: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three - 2,
    gap: Spacing.two,
  },
  telemetryItem: {
    flex: 1,
    gap: 2,
  },
  telemetryValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  announceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 6,
  },
  announceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  announceContent: {
    gap: 4,
  },
  announceTimestamp: {
    fontSize: 11,
    lineHeight: 15,
    fontVariant: ['tabular-nums'],
  },
  pickerSection: {
    gap: Spacing.two,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  slotCard: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.medium,
    gap: 2,
  },
  slotValue: {
    fontWeight: '700',
  },
  swapBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationPickerPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  searchRow: {
    minHeight: 40,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    minHeight: 38,
    fontSize: 14,
  },
  lineFilterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  lineFilterChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lineColorDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  stationListScroll: {
    maxHeight: 280,
  },
  verticalLineList: {
    paddingVertical: 4,
    gap: Spacing.two,
  },
  branchGroup: {
    gap: 0,
  },
  branchTitle: {
    fontSize: 11,
    marginBottom: 4,
    paddingLeft: 28,
  },
  vLineRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.one,
  },
  vTrackCol: {
    width: 22,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vTrackSeg: {
    width: 4,
    flex: 1,
  },
  vStationNode: {
    borderRadius: Radius.full,
  },
  vStationBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
  },
  vStationNameWrap: {
    flexShrink: 1,
  },
  roleTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  transferCircle: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferCircleText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  stationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stationChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  miniLineDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  actionBtn: {
    minHeight: 52,
    borderRadius: Radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actionText: {
    fontWeight: '700',
  },
});
