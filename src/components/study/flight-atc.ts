import type { FlightRoute } from './flight-routes';

/**
 * 비행 타이머용 실시간 항공 관제(ATC) 무선 교신 시뮬레이션 데이터.
 * 1단계(허가·텍싱) → 2단계(이륙) → 3단계(상승·순항) → 4단계(강하·접근) → 5단계(착륙·게이트)
 * 비행 진행률(0 ~ 1)에 따라 순차적으로 교신이 표시된다.
 */

export type AtcStage =
  | '1단계 · 비행 전 허가 및 텍싱'
  | '2단계 · 활주로 정렬 및 이륙'
  | '3단계 · 초기 상승 및 순항'
  | '4단계 · 강하 및 접근'
  | '5단계 · 최종 착륙 및 게이트 이동';

export type AtcMessage = {
  id: string;
  /** 이 진행률(0~1)에 도달하면 교신이 수신된다 */
  atProgress: number;
  stage: AtcStage;
  speaker: string;
  en: string;
  ko: string;
  highlight?: boolean;
  /** 지상 택싱(푸시백·유도로 이동·게이트 이동) 단계 교신 여부 */
  isTaxi?: boolean;
};

/** 택싱 포함 시 이륙 전 지상 활주 시간(초) 및 착륙 후 게이트 이동 시간(초) */
export const TAXI_OUT_SECONDS = 10 * 60;
export const TAXI_IN_SECONDS = 5 * 60;

/** 기본 비율 상수 */
export const TAXI_OUT_END_PROGRESS = 0.165;
export const TAXI_IN_START_PROGRESS = 0.975;

export type AtcRouteMeta = {
  callsignEn: string;
  callsignKo: string;
  destEn: string;
  destKo: string;
  destAirportEn: string;
  destAirportKo: string;
  destRunway: string;
  cruiseFL: string;
  cruiseFeetKo: string;
};

function metaForRoute(route: FlightRoute): AtcRouteMeta {
  const num = route.flightNo.replace(/^KE\s*/i, '');
  const isShort = route.distanceKm < 900;
  const isMedium = route.distanceKm < 3500;
  return {
    callsignEn: `Korean Air ${num}`,
    callsignKo: `대한항공 ${num}편`,
    destEn: route.cityToEn,
    destKo: route.cityTo,
    destAirportEn: `${route.cityToEn} Airport`,
    destAirportKo: `${route.cityTo} 공항`,
    destRunway: route.codeTo === 'CJU' ? '07' : '34L',
    cruiseFL: isShort ? 'Flight Level 250' : isMedium ? 'Flight Level 350' : 'Flight Level 380',
    cruiseFeetKo: isShort ? '25,000피트' : isMedium ? '35,000피트' : '38,000피트',
  };
}

/** 교신 수신 시각을 "2026년 11월 26일 23시 25분 10초" 형식으로 바꾼다. */
export function formatAtcTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}시 ${pad(d.getMinutes())}분 ${pad(d.getSeconds())}초`;
}

export function buildAtcTimeline(
  route: FlightRoute,
  includeTaxiing = true,
  taxiOutEnd = TAXI_OUT_END_PROGRESS,
  taxiInStart = TAXI_IN_START_PROGRESS,
): AtcMessage[] {
  const m = metaForRoute(route);

  const all: AtcMessage[] = [
    // 1단계: 비행 전 허가 및 푸시백·텍싱
    {
      id: 'atc-1',
      atProgress: 0.0,
      stage: '1단계 · 비행 전 허가 및 텍싱',
      speaker: '조종사 → 인천 비행허가중계소',
      en: `Incheon Delivery, ${m.callsignEn}, Gate 14, Information Charlie, request IFR clearance to ${m.destEn}.`,
      ko: `인천 딜리버리, ${m.callsignKo}, 14번 게이트, 기상정보 찰리 확인했습니다. ${m.destKo}행 계기비행 허가 요청합니다.`,
      isTaxi: true,
    },
    {
      id: 'atc-2',
      atProgress: 0.015,
      stage: '1단계 · 비행 전 허가 및 텍싱',
      speaker: '인천 비행허가중계소 → 조종사',
      en: `${m.callsignEn}, cleared to ${m.destAirportEn} via BULTI 1 Departure, flight planned route, climb and maintain 7,000 feet, squawk 4215.`,
      ko: `${m.callsignKo}, BULTI 1 출발절차 및 비행계획 항로로 ${m.destAirportKo}까지 허가합니다. 7,000피트까지 상승 유지, 트랜스폰더 코드 4215 입력하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-3',
      atProgress: 0.03,
      stage: '1단계 · 비행 전 허가 및 텍싱',
      speaker: '인천 지상관제소 → 조종사',
      en: `${m.callsignEn}, pushback and engine start approved, face north.`,
      ko: `${m.callsignKo}, 푸시백 및 엔진 시동 허가합니다. 기수는 북쪽을 향하도록 하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-4',
      atProgress: 0.048,
      stage: '1단계 · 비행 전 허가 및 텍싱',
      speaker: '인천 지상관제소 → 조종사',
      en: `${m.callsignEn}, taxi to Runway 33L via Bravo, Bravo 1, hold short of Runway 33L.`,
      ko: `${m.callsignKo}, 브라보·브라보 1 유도로를 통해 33L 활주로까지 지상활주하시고, 33L 활주로 대기선 앞에서 정지하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-5',
      atProgress: 0.06,
      stage: '1단계 · 비행 전 허가 및 텍싱',
      speaker: '조종사 → 인천 지상관제소',
      en: `Taxi to Runway 33L via Bravo, Bravo 1, hold short of Runway 33L, ${m.callsignEn}.`,
      ko: `브라보·브라보 1 유도로로 33L 활주로까지 이동, 33L 대기선 앞 정지 복창합니다, ${m.callsignKo}.`,
      isTaxi: true,
    },

    // 2단계: 활주로 정렬 및 이륙
    {
      id: 'atc-6',
      atProgress: 0.075,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '인천 지상관제소 → 조종사',
      en: `${m.callsignEn}, contact Incheon Tower on 118.2.`,
      ko: `${m.callsignKo}, 주파수 118.2번으로 인천 관제탑과 교신하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-7',
      atProgress: 0.09,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '인천 관제탑 → 조종사',
      en: `${m.callsignEn}, Runway 33L, line up and wait.`,
      ko: `${m.callsignKo}, 33L 활주로에 진입해 정렬 후 대기하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-8',
      atProgress: 0.105,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '인천 관제탑 → 조종사',
      en: `${m.callsignEn}, wind 320 at 8 knots, Runway 33L, cleared for takeoff.`,
      ko: `${m.callsignKo}, 바람 320도 방향 8노트, 33L 활주로 이륙을 허가합니다.`,
      highlight: true,
    },
    {
      id: 'atc-9',
      atProgress: 0.12,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '조종사 → 인천 관제탑',
      en: `Runway 33L, cleared for takeoff, ${m.callsignEn}.`,
      ko: `33L 활주로 이륙 허가 확인했습니다, ${m.callsignKo}.`,
    },
    {
      id: 'atc-10',
      atProgress: 0.135,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '조종실 내부 · 기장(PF)',
      en: 'Takeoff thrust set.',
      ko: '이륙 추력 설정 완료, 활주 시작합니다.',
    },
    {
      id: 'atc-11',
      atProgress: 0.15,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '조종실 내부 · 부기장(PM)',
      en: '80 knots.',
      ko: '속도 80노트 도달, 계기 정상입니다.',
    },
    {
      id: 'atc-12',
      atProgress: 0.165,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '조종실 내부 · 부기장(PM)',
      en: 'V1, Rotate.',
      ko: '이륙 결심속도 도달, 기수를 들어 올려 이륙합니다.',
      highlight: true,
    },
    {
      id: 'atc-13',
      atProgress: 0.18,
      stage: '2단계 · 활주로 정렬 및 이륙',
      speaker: '조종실 내부 · PM / PF',
      en: 'PM: "Positive rate." / PF: "Gear up."',
      ko: '상승률 확인되었습니다. / 착륙장치 접으십시오.',
    },

    // 3단계: 초기 상승 및 순항
    {
      id: 'atc-14',
      atProgress: 0.21,
      stage: '3단계 · 초기 상승 및 순항',
      speaker: '인천 관제탑 → 조종사',
      en: `${m.callsignEn}, airborne, contact Seoul Departure on 121.35.`,
      ko: `${m.callsignKo}, 이륙 확인했습니다. 121.35번으로 서울 출발관제소와 교신하십시오.`,
    },
    {
      id: 'atc-15',
      atProgress: 0.25,
      stage: '3단계 · 초기 상승 및 순항',
      speaker: '조종사 → 서울 출발관제소',
      en: `Seoul Departure, ${m.callsignEn}, passing 2,400 feet, climbing to 7,000 feet.`,
      ko: `서울 출발관제소, ${m.callsignKo}, 고도 2,400피트 통과 중이며 7,000피트로 상승 중입니다.`,
    },
    {
      id: 'atc-16',
      atProgress: 0.31,
      stage: '3단계 · 초기 상승 및 순항',
      speaker: '서울 출발관제소 → 조종사',
      en: `${m.callsignEn}, radar contact, climb and maintain ${m.cruiseFL}.`,
      ko: `${m.callsignKo}, 레이더 포착했습니다. 순항고도 ${m.cruiseFeetKo}까지 상승 유지하십시오.`,
    },
    {
      id: 'atc-17',
      atProgress: 0.45,
      stage: '3단계 · 초기 상승 및 순항',
      speaker: '서울 출발관제소 → 조종사',
      en: `${m.callsignEn}, contact Incheon Control on 124.5.`,
      ko: `${m.callsignKo}, 항로 관제를 위해 124.5번으로 인천 지역관제소와 교신하십시오.`,
    },

    // 4단계: 강하 및 접근
    {
      id: 'atc-18',
      atProgress: 0.65,
      stage: '4단계 · 강하 및 접근',
      speaker: '인천 지역관제소 → 조종사',
      en: `${m.callsignEn}, descend and maintain 10,000 feet, contact ${m.destEn} Approach on 121.2.`,
      ko: `${m.callsignKo}, 10,000피트로 강하 유지하시고, 121.2번으로 ${m.destKo} 접근관제소와 교신하십시오.`,
    },
    {
      id: 'atc-19',
      atProgress: 0.76,
      stage: '4단계 · 강하 및 접근',
      speaker: `${m.destKo} 접근관제소 → 조종사`,
      en: `${m.callsignEn}, turn left heading 100, descend and maintain 3,000 feet, cleared ILS Runway ${m.destRunway} approach.`,
      ko: `${m.callsignKo}, 기수방위 100도로 좌선회, 3,000피트로 강하 유지하시고, ${m.destRunway} 활주로 계기착륙접근을 허가합니다.`,
    },

    // 5단계: 최종 착륙 및 게이트 이동
    {
      id: 'atc-20',
      atProgress: 0.84,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `${m.destKo} 접근관제소 → 조종사`,
      en: `${m.callsignEn}, contact ${m.destEn} Tower on 118.2.`,
      ko: `${m.callsignKo}, 118.2번으로 ${m.destKo} 관제탑과 교신하십시오.`,
    },
    {
      id: 'atc-21',
      atProgress: 0.87,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `조종사 → ${m.destKo} 관제탑`,
      en: `${m.destEn} Tower, ${m.callsignEn}, established ILS Runway ${m.destRunway}.`,
      ko: `${m.destKo} 관제탑, ${m.callsignKo}, ${m.destRunway} 활주로 계기착륙 경로에 안착했습니다.`,
    },
    {
      id: 'atc-22',
      atProgress: 0.9,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `${m.destKo} 관제탑 → 조종사`,
      en: `${m.callsignEn}, wind 060 at 10 knots, Runway ${m.destRunway}, cleared to land.`,
      ko: `${m.callsignKo}, 바람 060도 방향 10노트, ${m.destRunway} 활주로 착륙을 허가합니다.`,
      highlight: true,
    },
    {
      id: 'atc-23',
      atProgress: 0.92,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `조종사 → ${m.destKo} 관제탑`,
      en: `Runway ${m.destRunway}, cleared to land, ${m.callsignEn}.`,
      ko: `${m.destRunway} 활주로 착륙 허가 복창합니다, ${m.callsignKo}.`,
    },
    {
      id: 'atc-24',
      atProgress: 0.95,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: '조종실 내부 · 자동음성 / 기장(PF)',
      en: 'GPWS: "Minimums." / PF: "Landing."',
      ko: '결심고도 도달 / 활주로 시인, 착륙을 계속합니다.',
    },
    {
      id: 'atc-25',
      atProgress: 0.975,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: '조종실 내부 · 부기장(PM)',
      en: 'Touchdown, spoilers deployed, reverse green, 60 knots.',
      ko: '접지 완료, 감속판 전개, 역추진 정상, 속도 60노트 감속 완료.',
      highlight: true,
    },
    {
      id: 'atc-26',
      atProgress: 0.99,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `${m.destKo} 관제탑 → 조종사`,
      en: `${m.callsignEn}, vacate left via Charlie 3, contact ${m.destEn} Ground on 121.7.`,
      ko: `${m.callsignKo}, 찰리 3 유도로를 통해 좌측으로 활주로를 이탈하시고, 121.7번으로 ${m.destKo} 지상관제소와 교신하십시오.`,
      isTaxi: true,
    },
    {
      id: 'atc-27',
      atProgress: 1.0,
      stage: '5단계 · 최종 착륙 및 게이트 이동',
      speaker: `${m.destKo} 지상관제소 → 조종사`,
      en: `${m.callsignEn}, taxi to Gate 5 via Papa, Sierra.`,
      ko: `${m.callsignKo}, 파파·시에라 유도로를 따라 5번 게이트까지 지상활주하십시오.`,
      isTaxi: true,
    },
  ];

  if (includeTaxiing) {
    // 실제 택싱 시간 비율(taxiOutEnd ~ taxiInStart)에 맞춰 각 구간 교신 시각을 재배치한다.
    return all.map((msg) => {
      const p = msg.atProgress;
      let mapped: number;
      if (p <= TAXI_OUT_END_PROGRESS) {
        mapped = (p / TAXI_OUT_END_PROGRESS) * taxiOutEnd;
      } else if (p <= TAXI_IN_START_PROGRESS) {
        const ratio =
          (p - TAXI_OUT_END_PROGRESS) /
          (TAXI_IN_START_PROGRESS - TAXI_OUT_END_PROGRESS);
        mapped = taxiOutEnd + ratio * (taxiInStart - taxiOutEnd);
      } else {
        const ratio = (p - TAXI_IN_START_PROGRESS) / (1 - TAXI_IN_START_PROGRESS);
        mapped = taxiInStart + ratio * (1 - taxiInStart);
      }
      return { ...msg, atProgress: Math.max(0, Math.min(1, mapped)) };
    });
  }

  // 바로 이륙 시: 지상 활주·푸시백·게이트 이동 교신을 제거하고, 남은 공중 비행 교신을 0~100%에 맞춰 재배치한다.
  const airborne = all.filter((msg) => !msg.isTaxi);
  const first = airborne[0]?.atProgress ?? 0;
  const last = airborne[airborne.length - 1]?.atProgress ?? 1;
  const span = Math.max(0.001, last - first);
  return airborne.map((msg) => ({
    ...msg,
    atProgress: Math.max(0, Math.min(1, (msg.atProgress - first) / span)),
  }));
}
