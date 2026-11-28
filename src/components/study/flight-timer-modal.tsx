import * as ScreenOrientation from 'expo-screen-orientation';
import {
  Armchair,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  LocateFixed,
  Minus,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Radio,
  Rows2,
  Search,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatClock } from '@/lib/study';

import { ArrivalOverlay } from './arrival-overlay';
import { FadeSlideIn } from './common';
import {
  BoardingPassTearOverlay,
  FlightSeatSelector,
  seatClassLabel,
  seatPositionLabel,
} from './flight-boarding';
import {
  buildAtcTimeline,
  formatAtcTimestamp,
  TAXI_IN_SECONDS,
  TAXI_OUT_SECONDS,
  type AtcMessage,
} from './flight-atc';
import { FlightGlobe, type FlightGlobeHandle } from './flight-globe';
import type { FlightGlobeState } from './flight-globe-html';
import {
  FLIGHT_REGIONS,
  FLIGHT_ROUTES,
  formatFlightMinutes,
  SECRET_TEST_FLIGHT_ROUTE,
  type FlightRegion,
} from './flight-routes';
import { FlightAudioPopup } from './flight-audio-popup';
import { useFlightAudio, useFlightAudioSettings } from './use-flight-audio';

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
 * Focus Flight 스타일 3D 지구본(WebView + Globe.gl) 비행 경로 타이머 모달.
 * - 세로/가로 모드 지원 (기기 회전 자동 대응 + 상단 전환 버튼)
 * - 실시간 ATC 항공 관제 교신 시뮬레이션 보이기/숨기기 토글
 * - 지도는 카드 블럭에 여백 없이 밀착되며 확대/축소/회전 가능
 */
export function FlightTimerModal({
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
  const globeRef = useRef<FlightGlobeHandle>(null);

  const [routeId, setRouteId] = useState<string>('cju');
  const [regionFilter, setRegionFilter] = useState<'전체' | FlightRegion>('전체');
  const [routeQuery, setRouteQuery] = useState('');
  const [mapInteracting, setMapInteracting] = useState(false);
  const [showAtc, setShowAtc] = useState(true);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const { settings: audioSettings, updateSettings: updateAudioSettings } = useFlightAudioSettings();
  const [flightMode, setFlightMode] = useState<'with-taxi' | 'immediate'>('with-taxi');
  const [selectedSeat, setSelectedSeat] = useState<string>('7A');
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  const [tearingMode, setTearingMode] = useState<'with-taxi' | 'immediate' | null>(null);
  const [landscapeOverride, setLandscapeOverride] = useState<boolean | null>(null);
  const [dismissedArrivalKey, setDismissedArrivalKey] = useState<string | null>(null);

  const isLandscape = landscapeOverride ?? width > height;

  const filteredRoutes = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    const normal = FLIGHT_ROUTES.filter((item) => {
      if (regionFilter !== '전체' && item.region !== regionFilter) return false;
      if (!q) return true;
      const hay = `${item.codeTo} ${item.cityTo} ${item.cityToEn} ${item.country}`.toLowerCase();
      return hay.includes(q);
    });
    // 공항 검색창에 "Test"를 입력했을 때만 30초 테스트 노선을 비밀스럽게 노출한다.
    if (q === 'test') {
      return [SECRET_TEST_FLIGHT_ROUTE, ...normal];
    }
    return normal;
  }, [regionFilter, routeQuery]);

  // 비행 타이머가 열려 있는 동안 휴대폰 가로/세로 회전을 허용하고, 닫으면 다시 세로로 되돌린다.
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
        // 기기에서 방향 잠금을 지원하지 않으면 레이아웃만 전환한다.
        setLandscapeOverride(nextLandscape);
      });
      return;
    }
    setLandscapeOverride(nextLandscape);
  }

  const route = useMemo(
    () =>
      routeId === SECRET_TEST_FLIGHT_ROUTE.id
        ? SECRET_TEST_FLIGHT_ROUTE
        : (FLIGHT_ROUTES.find((r) => r.id === routeId) ?? FLIGHT_ROUTES[0]),
    [routeId],
  );

  const isShortTestRoute = route.seconds !== undefined;
  const includeTaxiing = !isShortTestRoute && flightMode === 'with-taxi';
  const flightSeconds = route.seconds ?? route.minutes * 60;
  const totalWithTaxiSeconds = isShortTestRoute
    ? flightSeconds
    : flightSeconds + TAXI_OUT_SECONDS + TAXI_IN_SECONDS;
  const targetSeconds = includeTaxiing ? totalWithTaxiSeconds : flightSeconds;
  const taxiOutEnd = includeTaxiing ? TAXI_OUT_SECONDS / targetSeconds : 0;
  const taxiInStart = includeTaxiing
    ? (TAXI_OUT_SECONDS + flightSeconds) / targetSeconds
    : 1;

  const activeElapsed = running ? elapsedSeconds : 0;
  const progress = targetSeconds > 0 ? Math.min(1, activeElapsed / targetSeconds) : 0;
  const remaining = Math.max(0, targetSeconds - activeElapsed);
  const arrived = running && activeElapsed >= targetSeconds;
  const displayedElapsed = arrived ? targetSeconds : activeElapsed;
  const arrivalKey = `${startedAt ?? 0}:${routeId}`;
  const showArrivalOverlay = arrived && dismissedArrivalKey !== arrivalKey;

  const {
    onFlightStart,
    onFlightStop,
    previewSignVolume,
    previewSignPlay,
    previewFlyVolume,
    previewFlyRelease,
    stopAudioPreview,
  } = useFlightAudio({
    visible,
    running,
    arrived,
    remainingSeconds: remaining,
    arrivalKey,
    settings: audioSettings,
  });

  const anyAudioActive =
    audioSettings.enabled && (audioSettings.signEnabled || audioSettings.flyEnabled);

  const handleStop = useCallback(() => {
    onFlightStop();
    onStop();
  }, [onFlightStop, onStop]);

  // 택싱 포함 시: 이륙 전 지상 활주(TAXI_OUT_SECONDS) 동안 비행거리는 0km로 고정되고,
  // 착륙 후 게이트 이동(TAXI_IN_SECONDS) 동안에도 총 비행거리에서 더 늘어나지 않는다.
  const airProgress = useMemo(() => {
    if (!includeTaxiing) return progress;
    if (activeElapsed <= TAXI_OUT_SECONDS) return 0;
    if (activeElapsed >= TAXI_OUT_SECONDS + flightSeconds) return 1;
    return (activeElapsed - TAXI_OUT_SECONDS) / flightSeconds;
  }, [includeTaxiing, progress, activeElapsed, flightSeconds]);

  const flownKm = Math.round(route.distanceKm * airProgress);
  const remainingKm = Math.max(0, route.distanceKm - flownKm);
  const percent = Math.min(100, Math.round(progress * 100));

  const globeState = useMemo<FlightGlobeState>(
    () => ({
      fromLat: route.fromLat,
      fromLng: route.fromLng,
      toLat: route.toLat,
      toLng: route.toLng,
      codeFrom: route.codeFrom,
      codeTo: route.codeTo,
      progress: airProgress,
      arrived,
      running,
      routeId: route.id,
    }),
    [route, airProgress, arrived, running],
  );

  const [openedAt] = useState(() => Date.now());
  const atcBaseMs = running && startedAt ? startedAt : openedAt;

  const atcTimeline = useMemo(
    () => buildAtcTimeline(route, includeTaxiing, taxiOutEnd, taxiInStart),
    [route, includeTaxiing, taxiOutEnd, taxiInStart],
  );
  const receivedAtc = useMemo<AtcMessage[]>(() => {
    if (!running) return atcTimeline.slice(0, 1);
    const list = atcTimeline.filter((msg) => msg.atProgress <= progress + 0.0001);
    return (list.length > 0 ? list : atcTimeline.slice(0, 1)).slice().reverse();
  }, [atcTimeline, running, progress]);

  const isDark = resolvedScheme === 'dark';
  const cockpitBg = isDark ? '#090B10' : '#11131A';
  const cockpitBorder = isDark ? '#1F2430' : '#232734';
  const accent = '#FFFFFF';
  const accentMuted = 'rgba(255, 255, 255, 0.58)';
  const pathAccent = arrived ? theme.success : '#60A5FA';

  const statusText = arrived
    ? '목적지 도착'
    : running
      ? includeTaxiing && activeElapsed < TAXI_OUT_SECONDS
        ? '지상 활주 중'
        : includeTaxiing && activeElapsed >= TAXI_OUT_SECONDS + flightSeconds
          ? '게이트 이동 중'
          : '순항 중'
      : '탑승 준비';

  const globeNode = (
    <View style={[styles.globeArea, isLandscape && styles.globeAreaLandscape]}>
      <FlightGlobe
        ref={globeRef}
        state={globeState}
        height={isLandscape ? undefined : 284}
        onInteractChange={setMapInteracting}
      />

      {/* 상단 오버레이: 편명/과목 + 비행 상태 */}
      <View pointerEvents="none" style={styles.globeTopOverlay}>
        <View style={styles.overlayPill}>
          <Plane size={12} color={pathAccent} strokeWidth={2.2} />
          <ThemedText type="smallBold" numberOfLines={1} style={{ color: accent, fontSize: 12 }}>
            {route.flightNo} · {selectedSeat}
          </ThemedText>
          {subjectName ? (
            <>
              <ThemedText type="small" style={{ color: accentMuted, fontSize: 12 }}>
                ·
              </ThemedText>
              <View style={[styles.subjectDot, { backgroundColor: subjectColor }]} />
              <ThemedText
                type="small"
                numberOfLines={1}
                style={{ color: accent, fontSize: 12, flexShrink: 1 }}>
                {subjectName}
              </ThemedText>
            </>
          ) : null}
        </View>

        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: arrived
                ? 'rgba(16, 40, 26, 0.85)'
                : running
                  ? 'rgba(16, 30, 56, 0.85)'
                  : 'rgba(10, 14, 24, 0.78)',
              borderColor: arrived
                ? 'rgba(74, 222, 128, 0.45)'
                : running
                  ? 'rgba(96, 165, 250, 0.45)'
                  : 'rgba(255, 255, 255, 0.16)',
            },
          ]}>
          {arrived ? (
            <CheckCircle2 size={12} color={theme.success} strokeWidth={2.2} />
          ) : null}
          <ThemedText
            type="smallBold"
            numberOfLines={1}
            style={{
              color: arrived ? theme.success : running ? '#93C5FD' : accentMuted,
              fontSize: 12,
            }}>
            {statusText}
          </ThemedText>
        </View>
      </View>

      {/* 우측 하단 오버레이: 확대 / 축소 / 경로 초점 버튼 */}
      <View style={styles.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 확대"
          hitSlop={6}
          onPress={() => globeRef.current?.zoomIn()}
          style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.65 : 1 }]}>
          <Plus size={15} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지도 축소"
          hitSlop={6}
          onPress={() => globeRef.current?.zoomOut()}
          style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.65 : 1 }]}>
          <Minus size={15} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="경로 중심으로 이동"
          hitSlop={6}
          onPress={() => globeRef.current?.reset()}
          style={({ pressed }) => [styles.zoomBtn, { opacity: pressed ? 0.65 : 1 }]}>
          <LocateFixed size={14} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );

  const telemetryBlock = (
    <View style={[styles.cardFooter, { borderTopColor: cockpitBorder }]}>
      <View style={styles.airportsRow}>
        <View style={styles.airportCol}>
          <ThemedText style={[styles.airportCode, { color: accent }]}>
            {route.codeFrom}
          </ThemedText>
          <ThemedText type="small" style={{ color: accentMuted }}>
            {route.cityFrom}
          </ThemedText>
        </View>

        <View style={styles.airportMidLineWrap}>
          <View style={styles.airportLineRow}>
            <View style={[styles.solidLine, { backgroundColor: pathAccent }]} />
            <Plane size={15} color={pathAccent} strokeWidth={2} />
            <View
              style={[
                styles.solidLine,
                { backgroundColor: arrived ? theme.success : 'rgba(255,255,255,0.28)' },
              ]}
            />
          </View>
          <ThemedText type="smallBold" style={{ color: pathAccent, fontSize: 12 }}>
            {percent}% · {formatFlightMinutes(Math.round(targetSeconds / 60))}
          </ThemedText>
        </View>

        <View style={[styles.airportCol, styles.airportRight]}>
          <ThemedText style={[styles.airportCode, { color: accent }]}>
            {route.codeTo}
          </ThemedText>
          <ThemedText type="small" style={{ color: accentMuted }}>
            {route.cityTo}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.telemetryRow, { borderTopColor: cockpitBorder }]}>
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

      <View style={[styles.telemetryRow, { borderTopColor: cockpitBorder }]}>
        <View style={styles.telemetryItem}>
          <ThemedText type="small" style={{ color: accentMuted }}>
            비행거리
          </ThemedText>
          <ThemedText style={[styles.telemetryValue, { color: accent }]}>
            {flownKm.toLocaleString()} km
          </ThemedText>
        </View>
        <View style={styles.telemetryItem}>
          <ThemedText type="small" style={{ color: accentMuted }}>
            남은 비행거리
          </ThemedText>
          <ThemedText style={[styles.telemetryValue, { color: pathAccent }]}>
            {remainingKm.toLocaleString()} km
          </ThemedText>
        </View>
        <View style={styles.telemetryItem}>
          <ThemedText type="small" style={{ color: accentMuted }}>
            총 비행거리
          </ThemedText>
          <ThemedText style={[styles.telemetryValue, { color: accentMuted }]}>
            {route.distanceKm.toLocaleString()} km
          </ThemedText>
        </View>
      </View>
    </View>
  );

  const atcPanel = showAtc ? (
    <View
      style={[
        styles.atcCard,
        { backgroundColor: cockpitBg, borderColor: cockpitBorder },
      ]}>
      <View style={styles.atcHeader}>
        <View style={styles.atcHeaderLeft}>
          <Radio size={14} color={pathAccent} strokeWidth={2.2} />
          <ThemedText type="smallBold" style={{ color: accent }}>
            관제 교신 시뮬레이션
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ color: accentMuted }}>
          {running
            ? `${receivedAtc.length} / ${atcTimeline.length}`
            : '이륙 대기 중'}
        </ThemedText>
      </View>

      <View style={styles.atcList}>
        {receivedAtc.slice(0, 5).map((msg, idx) => {
          const isLatest = idx === 0;
          const msgTimestamp = formatAtcTimestamp(
            atcBaseMs + Math.round(msg.atProgress * targetSeconds * 1000),
          );
          return (
            <FadeSlideIn key={msg.id}>
              <View
                style={[
                  styles.atcItem,
                  {
                    backgroundColor: isLatest
                      ? 'rgba(96, 165, 250, 0.11)'
                      : 'rgba(255, 255, 255, 0.03)',
                    borderColor: isLatest
                      ? 'rgba(96, 165, 250, 0.35)'
                      : 'rgba(255, 255, 255, 0.08)',
                  },
                ]}>
                <View style={styles.atcMetaRow}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: isLatest ? '#93C5FD' : accentMuted,
                      fontSize: 11,
                    }}>
                    {msg.stage}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: accentMuted, fontSize: 11 }}>
                    {msg.speaker}
                  </ThemedText>
                </View>
                <ThemedText
                  type="small"
                  style={[styles.atcTimestamp, { color: accentMuted }]}>
                  {msgTimestamp}
                </ThemedText>
                <ThemedText
                  type="smallBold"
                  style={{
                    color: msg.highlight && isLatest ? '#FFFFFF' : '#E2E8F0',
                    lineHeight: 19,
                  }}>
                  &ldquo;{msg.en}&rdquo;
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: accentMuted, lineHeight: 18 }}>
                  {msg.ko}
                </ThemedText>
              </View>
            </FadeSlideIn>
          );
        })}
      </View>
    </View>
  ) : null;

  const controlsSection = useMemo(
    () => (
      <>
        <View style={styles.routeSection}>
        <View style={styles.routeHeaderRow}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            목적지 노선 선택
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {filteredRoutes.length}곳
          </ThemedText>
        </View>

        {/* 공항 검색 입력 */}
        <View
          style={[
            styles.routeSearchRow,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}>
          <Search size={15} color={theme.textSecondary} strokeWidth={1.9} />
          <TextInput
            value={routeQuery}
            onChangeText={setRouteQuery}
            placeholder="공항 코드·도시·국가 검색 (예: NRT, 파리, 일본)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            style={[styles.routeSearchInput, { color: theme.text }]}
          />
          {routeQuery.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              hitSlop={8}
              onPress={() => setRouteQuery('')}>
              <X size={14} color={theme.textSecondary} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {/* 권역 필터 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionRow}>
          {FLIGHT_REGIONS.map((region) => {
            const active = regionFilter === region;
            return (
              <Pressable
                key={region}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setRegionFilter(region)}
                style={({ pressed }) => [
                  styles.regionChip,
                  {
                    backgroundColor: active ? theme.tint : theme.backgroundElement,
                    borderColor: active ? theme.tint : theme.border,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{
                    color: active ? theme.onTint : theme.textSecondary,
                    fontSize: 12,
                  }}>
                  {region}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 공항 목록 */}
        {filteredRoutes.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyRoutes}>
            검색 조건에 맞는 공항이 없습니다.
          </ThemedText>
        ) : (
          <ScrollView
            nestedScrollEnabled
            style={styles.routeListScroll}
            contentContainerStyle={styles.routeGrid}
            showsVerticalScrollIndicator>
            {filteredRoutes.map((item) => {
              const selected = item.id === route.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setRouteId(item.id)}
                  style={({ pressed }) => [
                    styles.routeChip,
                    {
                      backgroundColor: selected
                        ? theme.tint
                        : theme.backgroundElement,
                      borderColor: selected ? theme.tint : theme.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}>
                  <View style={styles.routeChipTop}>
                    <ThemedText
                      type="smallBold"
                      numberOfLines={1}
                      style={{ color: selected ? theme.onTint : theme.text }}>
                      {item.codeTo} · {item.cityTo}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="small"
                    numberOfLines={1}
                    style={{
                      color: selected ? theme.onTint : theme.textSecondary,
                      opacity: selected ? 0.85 : 1,
                      fontSize: 11,
                    }}>
                    {item.country} · {formatFlightMinutes(item.minutes)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 좌석 선택 아코디언 */}
      {!running ? (
        <View style={styles.seatSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="비행기 좌석 선택 열기"
            accessibilityState={{ expanded: seatPickerOpen }}
            onPress={() => setSeatPickerOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.seatToggleRow,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: seatPickerOpen ? theme.tint : theme.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}>
            <View style={styles.seatToggleLeft}>
              <Armchair size={16} color={theme.textSecondary} strokeWidth={1.9} />
              <ThemedText type="smallBold">좌석</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedSeat} ({seatClassLabel(selectedSeat)} · {seatPositionLabel(selectedSeat)})
              </ThemedText>
            </View>
            {seatPickerOpen ? (
              <ChevronUp size={16} color={theme.textSecondary} strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color={theme.textSecondary} strokeWidth={2} />
            )}
          </Pressable>

          {seatPickerOpen ? (
            <FlightSeatSelector
              selectedSeat={selectedSeat}
              onSelectSeat={(seat) => {
                setSelectedSeat(seat);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {running ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={handleStop}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              opacity: busy ? 0.55 : pressed ? 0.8 : 1,
            },
          ]}>
          <PlaneLanding size={19} color={theme.text} strokeWidth={2} />
          <ThemedText type="default" style={[styles.actionText, { color: theme.text }]}>
            {arrived ? '착륙하고 기록 저장하기' : '비행 중단하고 기록하기'}
          </ThemedText>
        </Pressable>
      ) : isShortTestRoute ? (
        <View style={styles.launchActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy || tearingMode !== null}
            onPress={() => {
              setFlightMode('immediate');
              setTearingMode('immediate');
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: theme.tint,
                borderColor: theme.tint,
                opacity: busy || tearingMode !== null ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}>
            <PlaneTakeoff size={19} color={theme.onTint} strokeWidth={2} />
            <ThemedText type="default" style={[styles.actionText, { color: theme.onTint }]}>
              {`${route.codeTo} 테스트 비행 출발 (${formatFlightMinutes(route.minutes)})`}
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <View style={styles.launchActions}>
          <Pressable
            accessibilityRole="button"
            disabled={busy || tearingMode !== null}
            onPress={() => {
              setFlightMode('with-taxi');
              setTearingMode('with-taxi');
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: theme.tint,
                borderColor: theme.tint,
                opacity: busy || tearingMode !== null ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}>
            <PlaneTakeoff size={19} color={theme.onTint} strokeWidth={2} />
            <ThemedText type="default" style={[styles.actionText, { color: theme.onTint }]}>
              {`${route.codeTo} 출발 · 택싱 포함 (${formatFlightMinutes(Math.round(totalWithTaxiSeconds / 60))})`}
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy || tearingMode !== null}
            onPress={() => {
              setFlightMode('immediate');
              setTearingMode('immediate');
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                opacity: busy || tearingMode !== null ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}>
            <Zap size={17} color={theme.text} strokeWidth={2} />
            <ThemedText type="default" style={[styles.actionText, { color: theme.text }]}>
              {`바로 이륙 (${formatFlightMinutes(route.minutes)})`}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </>
    ),
    [
      filteredRoutes,
      route,
      routeQuery,
      regionFilter,
      running,
      arrived,
      busy,
      tearingMode,
      seatPickerOpen,
      selectedSeat,
      isShortTestRoute,
      totalWithTaxiSeconds,
      theme,
      handleStop,
    ],
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
            <Plane size={18} color={theme.text} strokeWidth={2} />
            <ThemedText type="default" style={styles.topTitle}>
              비행 타이머
            </ThemedText>
          </View>

          <View style={styles.topBarActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="비행 오디오 설정 열기"
              accessibilityState={{ expanded: audioPanelOpen, selected: anyAudioActive }}
              hitSlop={6}
              onPress={() => setAudioPanelOpen((prev) => !prev)}
              style={({ pressed }) => [
                styles.topPillBtn,
                {
                  backgroundColor: anyAudioActive ? theme.tint : theme.backgroundElement,
                  borderColor: anyAudioActive ? theme.tint : theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              {anyAudioActive ? (
                <Volume2 size={13} color={theme.onTint} strokeWidth={2} />
              ) : (
                <VolumeX size={13} color={theme.textSecondary} strokeWidth={2} />
              )}
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{
                  color: anyAudioActive ? theme.onTint : theme.text,
                  fontSize: 12,
                }}>
                {anyAudioActive ? '소리 ON' : '소리 OFF'}
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showAtc ? '비행기 교신 숨기기' : '비행기 교신 보이기'}
              accessibilityState={{ selected: showAtc }}
              hitSlop={6}
              onPress={() => setShowAtc((prev) => !prev)}
              style={({ pressed }) => [
                styles.topPillBtn,
                styles.atcToggleBtn,
                {
                  backgroundColor: showAtc ? theme.tint : theme.backgroundElement,
                  borderColor: showAtc ? theme.tint : theme.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Radio
                size={13}
                color={showAtc ? theme.onTint : theme.textSecondary}
                strokeWidth={2}
              />
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={{
                  color: showAtc ? theme.onTint : theme.text,
                  fontSize: 12,
                }}>
                {showAtc ? '교신 ON' : '교신 OFF'}
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
              accessibilityLabel="비행 타이머 닫기"
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
          /* 가로 모드: 왼쪽 3D 지구본(여백 없음), 오른쪽 계기판·교신·노선 제어 */
          <View style={styles.landscapeBody}>
            <View
              style={[
                styles.landscapeMapPane,
                { backgroundColor: cockpitBg, borderColor: cockpitBorder },
              ]}>
              {globeNode}
            </View>

            <ScrollView
              style={styles.landscapeSidePane}
              contentContainerStyle={styles.landscapeSideContent}
              showsVerticalScrollIndicator={false}>
              <View
                style={[
                  styles.flightCard,
                  { backgroundColor: cockpitBg, borderColor: cockpitBorder },
                ]}>
                {telemetryBlock}
              </View>
              {atcPanel}
              {controlsSection}
            </ScrollView>
          </View>
        ) : (
          /* 세로 모드 */
          <ScrollView
            scrollEnabled={!mapInteracting}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.flightCard,
                { backgroundColor: cockpitBg, borderColor: cockpitBorder },
              ]}>
              {globeNode}
              {telemetryBlock}
            </View>

            {atcPanel}
            {controlsSection}

            <ThemedText type="small" themeColor="textSecondary" style={styles.footerHint}>
              지구본을 드래그하거나 두 손가락으로 확대·축소할 수 있어요.
            </ThemedText>
          </ScrollView>
        )}

        <FlightAudioPopup
          visible={audioPanelOpen}
          settings={audioSettings}
          onUpdate={updateAudioSettings}
          onPreviewSignVolume={previewSignVolume}
          onPreviewSignPlay={previewSignPlay}
          onPreviewFlyVolume={previewFlyVolume}
          onPreviewFlyRelease={previewFlyRelease}
          onClose={() => {
            stopAudioPreview();
            setAudioPanelOpen(false);
          }}
        />

        <BoardingPassTearOverlay
          visible={tearingMode !== null}
          route={route}
          seat={selectedSeat}
          subjectName={subjectName}
          totalMinutes={
            tearingMode === 'immediate'
              ? route.minutes
              : Math.round(totalWithTaxiSeconds / 60)
          }
          modeLabel={tearingMode === 'immediate' ? '바로 이륙' : '택싱 포함'}
          onComplete={() => {
            setTearingMode(null);
            onFlightStart();
            onStart();
          }}
        />

        <ArrivalOverlay
          visible={showArrivalOverlay}
          backgroundColor="#1D4ED8"
          icon={PlaneLanding}
          badge={route.flightNo}
          destination={`${route.cityFrom}(${route.codeFrom}) → ${route.cityTo}(${route.codeTo})`}
          saving={busy}
          onSave={() => {
            setDismissedArrivalKey(arrivalKey);
            handleStop();
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
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
    justifyContent: 'center',
    flexShrink: 0,
    gap: 4,
  },
  atcToggleBtn: {
    minWidth: 82,
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
  landscapeMapPane: {
    flex: 1.15,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  landscapeSidePane: {
    flex: 1,
  },
  landscapeSideContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  flightCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  globeArea: {
    position: 'relative',
    width: '100%',
  },
  globeAreaLandscape: {
    flex: 1,
  },
  globeTopOverlay: {
    position: 'absolute',
    top: Spacing.two + 2,
    left: Spacing.two + 2,
    right: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  overlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(10, 14, 24, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  zoomControls: {
    position: 'absolute',
    right: Spacing.two + 2,
    bottom: Spacing.two + 2,
    gap: 6,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(10, 14, 24, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  airportsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  airportCol: {
    gap: 2,
  },
  airportRight: {
    alignItems: 'flex-end',
  },
  airportMidLineWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  airportLineRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  solidLine: {
    flex: 1,
    height: 2,
    borderRadius: Radius.full,
  },
  airportCode: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: 1,
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
  atcCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  atcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  atcHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  atcList: {
    gap: Spacing.two,
  },
  atcItem: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    padding: Spacing.two + 2,
    gap: 4,
  },
  atcMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  atcTimestamp: {
    fontSize: 11,
    lineHeight: 15,
    fontVariant: ['tabular-nums'],
  },
  routeSection: {
    gap: Spacing.two,
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeSearchRow: {
    minHeight: 40,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  routeSearchInput: {
    flex: 1,
    minHeight: 38,
    fontSize: 14,
  },
  regionRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  regionChip: {
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeListScroll: {
    maxHeight: 220,
  },
  routeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  routeChip: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 136,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two + 1,
    borderRadius: Radius.medium,
    borderWidth: 1,
    gap: 2,
  },
  routeChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyRoutes: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
  seatSection: {
    gap: Spacing.two,
  },
  seatToggleRow: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  seatToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  launchActions: {
    gap: Spacing.two,
  },
  actionBtn: {
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  actionText: {
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  footerHint: {
    textAlign: 'center',
  },
});
