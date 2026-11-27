/**
 * 수도권 전철 24개 노선 전체 역 데이터 및 최단 경로(환승 포함) 탐색기.
 * 노선: 1~9호선, 경의·중앙선, 수인·분당선, 신분당선, 공항철도, 경춘선, 경강선, 서해선,
 *       GTX-A, 인천 1·2호선, 김포골드라인, 신림선, 우이신설선, 의정부경전철, 용인경전철
 */

export type SubwayLine = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  /** 역간 평균 소요 시간(초) */
  secondsPerStop: number;
  /** 본선 및 지선별 순차 역 목록 */
  branches: readonly (readonly string[])[];
  /** 순환선 여부 (2호선 본선 등) */
  circularFirstBranch?: boolean;
};

export const SUBWAY_LINES: readonly SubwayLine[] = [
  {
    id: 'line1',
    name: '1호선',
    shortName: '1',
    color: '#0052A4',
    secondsPerStop: 125,
    branches: [
      // 본선: 연천 ~ 인천
      [
        '연천', '전곡', '청산', '소요산', '동두천', '보산', '동두천중앙', '지행', '덕정', '덕계',
        '양주', '녹양', '가능', '의정부', '회룡', '망월사', '도봉산', '도봉', '방학', '창동',
        '녹천', '월계', '광운대', '석계', '신이문', '외대앞', '회기', '청량리', '제기동', '신설동',
        '동묘앞', '동대문', '종로5가', '종로3가', '종각', '시청', '서울역', '남영', '용산', '노량진',
        '대방', '신길', '영등포', '신도림', '구로', '구일', '개봉', '오류동', '온수', '역곡',
        '소사', '부천', '중동', '송내', '부개', '부평', '백운', '동암', '간석', '주안',
        '도화', '제물포', '도원', '동인천', '인천',
      ],
      // 경부선 지선: 구로 ~ 신창
      [
        '구로', '가산디지털단지', '독산', '금천구청', '석수', '관악', '안양', '명학', '금정', '군포',
        '당정', '의왕', '성균관대', '화서', '수원', '세류', '병점', '세마', '오산대', '오산',
        '진위', '송탄', '서정리', '평택지제', '평택', '성환', '직산', '두정', '천안', '봉명',
        '쌍용', '아산', '탕정', '배방', '온양온천', '신창',
      ],
      // 광명 지선
      ['금천구청', '광명'],
      // 서동탄 지선
      ['병점', '서동탄'],
    ],
  },
  {
    id: 'line2',
    name: '2호선',
    shortName: '2',
    color: '#00A84D',
    secondsPerStop: 120,
    circularFirstBranch: true,
    branches: [
      // 본선 순환 (43개)
      [
        '시청', '을지로입구', '을지로3가', '을지로4가', '동대문역사문화공원', '신당', '상왕십리', '왕십리',
        '한양대', '뚝섬', '성수', '건대입구', '구의', '강변', '잠실나루', '잠실', '잠실새내', '종합운동장',
        '삼성', '선릉', '역삼', '강남', '교대', '서초', '방배', '사당', '낙성대', '서울대입구',
        '봉천', '신림', '신대방', '구로디지털단지', '대림', '신도림', '문래', '영등포구청', '당산', '합정',
        '홍대입구', '신촌', '이대', '아현', '충정로',
      ],
      // 성수지선
      ['성수', '용답', '신답', '용두', '신설동'],
      // 신정지선
      ['신도림', '도림천', '양천구청', '신정네거리', '까치산'],
    ],
  },
  {
    id: 'line3',
    name: '3호선',
    shortName: '3',
    color: '#EF7C1C',
    secondsPerStop: 125,
    branches: [
      [
        '대화', '주엽', '정발산', '마두', '백석', '대곡', '화정', '원당', '원흥', '삼송',
        '지축', '구파발', '연신내', '불광', '녹번', '홍제', '무악재', '독립문', '경복궁', '안국',
        '종로3가', '을지로3가', '충무로', '동대입구', '약수', '금호', '옥수', '압구정', '신사', '잠원',
        '고속터미널', '교대', '남부터미널', '양재', '매봉', '도곡', '대치', '학여울', '대청', '일원',
        '수서', '가락시장', '경찰병원', '오금',
      ],
    ],
  },
  {
    id: 'line4',
    name: '4호선',
    shortName: '4',
    color: '#00A5DE',
    secondsPerStop: 125,
    branches: [
      [
        '진접', '오남', '별내별가람', '불암산', '상계', '노원', '창동', '쌍문', '수유', '미아',
        '미아사거리', '길음', '성신여대입구', '한성대입구', '혜화', '동대문', '동대문역사문화공원', '충무로', '명동', '회현',
        '서울역', '숙대입구', '삼각지', '신용산', '이촌', '동작', '이수', '사당', '남태령', '선바위',
        '경마공원', '대공원', '과천', '정부과천청사', '인덕원', '평촌', '범계', '금정', '산본', '수리산',
        '대야미', '반월', '상록수', '한대앞', '중앙', '고잔', '초지', '안산', '신길온천', '정왕',
        '오이도',
      ],
    ],
  },
  {
    id: 'line5',
    name: '5호선',
    shortName: '5',
    color: '#996CAC',
    secondsPerStop: 120,
    branches: [
      // 방화 ~ 하남검단산
      [
        '방화', '개화산', '김포공항', '송정', '마곡', '발산', '우장산', '화곡', '까치산', '신정',
        '목동', '오목교', '양평', '영등포구청', '영등포시장', '신길', '여의도', '여의나루', '마포', '공덕',
        '애오개', '충정로', '서대문', '광화문', '종로3가', '을지로4가', '동대문역사문화공원', '청구', '신금호', '행당',
        '왕십리', '마장', '답십리', '장한평', '군자', '아차산', '광나루', '천호', '강동', '길동',
        '굽은다리', '명일', '고덕', '상일동', '강일', '미사', '하남풍산', '하남시청', '하남검단산',
      ],
      // 마천 지선
      ['강동', '둔촌동', '올림픽공원', '방이', '오금', '개롱', '거여', '마천'],
    ],
  },
  {
    id: 'line6',
    name: '6호선',
    shortName: '6',
    color: '#CD7C2F',
    secondsPerStop: 115,
    branches: [
      [
        '응암', '역촌', '불광', '독바위', '연신내', '구산', '응암', '새절', '증산', '디지털미디어시티',
        '월드컵경기장', '마포구청', '망원', '합정', '상수', '광흥창', '대흥', '공덕', '효창공원앞', '삼각지',
        '녹사평', '이태원', '한강진', '버티고개', '약수', '청구', '신당', '동묘앞', '창신', '보문',
        '안암', '고려대', '월곡', '상월곡', '돌곶이', '석계', '태릉입구', '화랑대', '봉화산', '신내',
      ],
    ],
  },
  {
    id: 'line7',
    name: '7호선',
    shortName: '7',
    color: '#747F00',
    secondsPerStop: 120,
    branches: [
      [
        '장암', '도봉산', '수락산', '마들', '노원', '중계', '하계', '공릉', '태릉입구', '먹골',
        '중화', '상봉', '면목', '사가정', '용마산', '중곡', '군자', '어린이대공원', '건대입구', '자양',
        '청담', '강남구청', '학동', '논현', '반포', '고속터미널', '내방', '이수', '남성', '숭실대입구',
        '상도', '장승배기', '신대방삼거리', '보라매', '신풍', '대림', '남구로', '가산디지털단지', '철산', '광명사거리',
        '천왕', '온수', '까치울', '부천종합운동장', '춘의', '신중동', '부천시청', '상동', '삼산체육관', '굴포천',
        '부평구청', '산곡', '석남',
      ],
    ],
  },
  {
    id: 'line8',
    name: '8호선',
    shortName: '8',
    color: '#E6186C',
    secondsPerStop: 120,
    branches: [
      [
        '별내', '다산', '동구릉', '구리', '장자호수공원', '암사역사공원', '암사', '천호', '강동구청', '몽촌토성',
        '잠실', '석촌', '송파', '가락시장', '문정', '장지', '복정', '남위례', '산성', '남한산성입구',
        '단대오거리', '신흥', '수진', '모란',
      ],
    ],
  },
  {
    id: 'line9',
    name: '9호선',
    shortName: '9',
    color: '#BDB092',
    secondsPerStop: 120,
    branches: [
      [
        '개화', '김포공항', '공항시장', '신방화', '마곡나루', '양천향교', '가양', '증미', '등촌', '염창',
        '신목동', '선유도', '당산', '국회의사당', '여의도', '샛강', '노량진', '노들', '흑석', '동작',
        '구반포', '신반포', '고속터미널', '사평', '신논현', '언주', '선정릉', '삼성중앙', '봉은사', '종합운동장',
        '삼전', '석촌고분', '석촌', '송파나루', '한성백제', '올림픽공원', '둔촌오륜', '중앙보훈병원',
      ],
    ],
  },
  {
    id: 'gyeongui',
    name: '경의·중앙선',
    shortName: '경의중앙',
    color: '#77C4A3',
    secondsPerStop: 150,
    branches: [
      // 임진강 ~ 지평
      [
        '임진강', '운천', '문산', '파주', '월롱', '금촌', '금릉', '운정', '야당', '탄현',
        '일산', '풍산', '백마', '곡산', '대곡', '능곡', '행신', '강매', '한국항공대', '수색',
        '디지털미디어시티', '가좌', '홍대입구', '서강대', '공덕', '효창공원앞', '용산', '이촌', '서빙고', '한남',
        '옥수', '응봉', '왕십리', '청량리', '회기', '중랑', '상봉', '망우', '양원', '구리',
        '도농', '양정', '덕소', '도심', '팔당', '운길산', '양수', '신원', '국수', '아신',
        '오빈', '양평(경의중앙선)', '원덕', '용문', '지평',
      ],
      // 서울역 지선
      ['가좌', '신촌(경의중앙선)', '서울역'],
    ],
  },
  {
    id: 'suinbundang',
    name: '수인·분당선',
    shortName: '수인분당',
    color: '#F5A200',
    secondsPerStop: 130,
    branches: [
      [
        '청량리', '왕십리', '서울숲', '압구정로데오', '강남구청', '선정릉', '선릉', '한티', '도곡', '구룡',
        '개포동', '대모산입구', '수서', '복정', '가천대', '태평', '모란', '야탑', '이매', '서현',
        '수내', '정자', '미금', '오리', '죽전', '보정', '구성', '신갈', '기흥', '상갈',
        '청명', '영통', '망포', '매탄권선', '수원시청', '매교', '수원', '고색', '오목천', '어천',
        '야목', '사리', '한대앞', '중앙', '고잔', '초지', '안산', '신길온천', '정왕', '오이도',
        '달월', '월곶', '소래포구', '인천논현', '호구포', '남동인더스파크', '원인재', '연수', '송도', '인하대',
        '숭의', '신포', '인천',
      ],
    ],
  },
  {
    id: 'shinbundang',
    name: '신분당선',
    shortName: '신분당',
    color: '#D4003B',
    secondsPerStop: 135,
    branches: [
      [
        '신사', '논현', '신논현', '강남', '양재', '양재시민의숲', '청계산입구', '판교', '정자', '미금',
        '동천', '수지구청', '성복', '상현', '광교중앙', '광교',
      ],
    ],
  },
  {
    id: 'arex',
    name: '공항철도',
    shortName: '공항철도',
    color: '#0090D2',
    secondsPerStop: 210,
    branches: [
      [
        '서울역', '공덕', '홍대입구', '디지털미디어시티', '마곡나루', '김포공항', '계양', '검암', '청라국제도시', '영종',
        '운서', '공항화물청사', '인천공항1터미널', '인천공항2터미널',
      ],
    ],
  },
  {
    id: 'gyeongchun',
    name: '경춘선',
    shortName: '경춘',
    color: '#0C8E72',
    secondsPerStop: 180,
    branches: [
      [
        '청량리', '회기', '중랑', '상봉', '망우', '신내', '갈매', '별내', '퇴계원', '사릉',
        '금곡', '평내호평', '천마산', '마석', '대성리', '청평', '상천', '가평', '굴봉산', '백양리',
        '강촌', '김유정', '남춘천', '춘천',
      ],
      ['광운대', '상봉'],
    ],
  },
  {
    id: 'gyeonggang',
    name: '경강선',
    shortName: '경강',
    color: '#003DA5',
    secondsPerStop: 200,
    branches: [
      [
        '판교', '성남', '이매', '삼동', '경기광주', '초월', '곤지암', '신둔도예촌', '이천', '부발',
        '세종대왕릉', '여주',
      ],
    ],
  },
  {
    id: 'seohae',
    name: '서해선',
    shortName: '서해',
    color: '#81A914',
    secondsPerStop: 150,
    branches: [
      [
        '일산', '풍산', '백마', '곡산', '대곡', '능곡', '김포공항', '원종', '부천종합운동장', '소사',
        '소새울', '시흥대야', '신천', '신현', '시흥시청', '시흥능곡', '달미', '선부', '초지', '시우',
        '원시',
      ],
    ],
  },
  {
    id: 'gtxa',
    name: 'GTX-A',
    shortName: 'GTX-A',
    color: '#9A6292',
    secondsPerStop: 270,
    branches: [
      // 북부 구간
      ['운정중앙', '킨텍스', '대곡', '연신내', '서울역'],
      // 남부 구간
      ['수서', '성남', '구성', '동탄'],
    ],
  },
  {
    id: 'incheon1',
    name: '인천 1호선',
    shortName: '인천1',
    color: '#7CA8D5',
    secondsPerStop: 120,
    branches: [
      [
        '검단호수공원', '신검단중앙', '아라', '계양', '귤현', '박촌', '임학', '계산', '경인교대입구', '작전',
        '갈산', '부평구청', '부평시장', '부평', '동수', '부평삼거리', '간석오거리', '인천시청', '예술회관', '인천터미널',
        '문학경기장', '선학', '신연수', '원인재', '동춘', '동막', '캠퍼스타운', '테크노파크', '지식정보단지', '인천대입구',
        '센트럴파크', '국제업무지구', '송도달빛축제공원',
      ],
    ],
  },
  {
    id: 'incheon2',
    name: '인천 2호선',
    shortName: '인천2',
    color: '#ED8B00',
    secondsPerStop: 115,
    branches: [
      [
        '검단오류', '왕길', '검단사거리', '마전', '완정', '독정', '검암', '검바위', '아시아드경기장', '서구청',
        '가정', '가정중앙시장', '석남', '서부여성회관', '인천가좌', '가재울', '주안국가산단', '주안', '시민공원', '석바위시장',
        '인천시청', '석천사거리', '모래내시장', '만수', '남동구청', '인천대공원', '운연',
      ],
    ],
  },
  {
    id: 'gimpo',
    name: '김포골드라인',
    shortName: '김포골드',
    color: '#A17800',
    secondsPerStop: 150,
    branches: [
      [
        '양촌', '구래', '마산', '장기', '운양', '걸포북변', '사우', '풍무', '고촌', '김포공항',
      ],
    ],
  },
  {
    id: 'sillim',
    name: '신림선',
    shortName: '신림',
    color: '#6789CA',
    secondsPerStop: 105,
    branches: [
      [
        '샛강', '대방', '서울지방병무청', '보라매', '보라매공원', '보라매병원', '당곡', '신림', '서원', '서울대벤처타운',
        '관악산',
      ],
    ],
  },
  {
    id: 'uisinseol',
    name: '우이신설선',
    shortName: '우이신설',
    color: '#B7C452',
    secondsPerStop: 105,
    branches: [
      [
        '북한산우이', '솔밭공원', '4.19민주묘지', '가오리', '화계', '삼양', '삼양사거리', '솔샘', '북한산보국문', '정릉',
        '성신여대입구', '보문', '신설동',
      ],
    ],
  },
  {
    id: 'uijeongbu',
    name: '의정부경전철',
    shortName: '의정부',
    color: '#FDA600',
    secondsPerStop: 105,
    branches: [
      [
        '발곡', '회룡', '범골', '경전철의정부', '의정부시청', '흥선', '의정부중앙', '동오', '새말', '경기도청북부청사',
        '효자', '곤제', '어룡', '송산', '탑석', '복합문화융합단지',
      ],
    ],
  },
  {
    id: 'everline',
    name: '용인경전철',
    shortName: '용인',
    color: '#509F22',
    secondsPerStop: 115,
    branches: [
      [
        '기흥', '강남대', '지석', '어정', '동백', '초당', '삼가', '시청·용인대', '명지대', '김량장',
        '용인중앙시장', '고진', '보평', '둔전', '전대·에버랜드',
      ],
    ],
  },
];

export type StationInfo = {
  name: string;
  lineIds: string[];
};

const LINE_MAP = new Map<string, SubwayLine>(SUBWAY_LINES.map((line) => [line.id, line]));

export function getSubwayLine(lineId: string): SubwayLine {
  return LINE_MAP.get(lineId) ?? SUBWAY_LINES[0];
}

/** 역 이름 뒤에 "역"을 자연스럽게 붙인다. 이미 "역"으로 끝나면 중복하지 않는다(예: 서울역 → 서울역, 강남 → 강남역). */
export function formatStationName(name: string): string {
  const clean = name.replace(/\([^)]*\)$/, '').trim();
  if (clean.endsWith('역')) return clean;
  return `${clean}역`;
}

/** 한국어 조사 "으로 / 로"를 받침에 맞춰 붙인다(예: 1호선 → 1호선으로, 공항철도 → 공항철도로, GTX-A → GTX-A로). */
export function withEuro(word: string): string {
  if (!word) return '';
  const last = word.charCodeAt(word.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3) {
    const jongseong = (last - 0xac00) % 28;
    // 받침이 없거나 ㄹ 받침(8)이면 "로", 그 외 받침이면 "으로"
    return jongseong === 0 || jongseong === 8 ? `${word}로` : `${word}으로`;
  }
  return `${word}로`;
}

// 환승역 중복 제거 전체 역 목록 & 인접 그래프 구성 (지하철 모드를 처음 열 때만 지연 초기화)
type Edge = { toStation: string; toLineId: string; cost: number; isTransfer: boolean };
const TRANSFER_PENALTY_SECONDS = 240;

let stationLineMapCache: Map<string, Set<string>> | null = null;
let graphCache: Map<string, Edge[]> | null = null;
let allStationsCache: readonly StationInfo[] | null = null;

function nodeKey(station: string, lineId: string): string {
  return `${station}@@${lineId}`;
}

function ensureSubwayGraph(): {
  stationLineMap: Map<string, Set<string>>;
  graph: Map<string, Edge[]>;
} {
  if (stationLineMapCache && graphCache) {
    return { stationLineMap: stationLineMapCache, graph: graphCache };
  }

  const stationLineMap = new Map<string, Set<string>>();
  const graph = new Map<string, Edge[]>();

  const addEdge = (from: string, edge: Edge) => {
    let list = graph.get(from);
    if (!list) {
      list = [];
      graph.set(from, list);
    }
    list.push(edge);
  };

  for (const line of SUBWAY_LINES) {
    line.branches.forEach((branch, branchIdx) => {
      for (let i = 0; i < branch.length; i++) {
        const st = branch[i];
        let set = stationLineMap.get(st);
        if (!set) {
          set = new Set();
          stationLineMap.set(st, set);
        }
        set.add(line.id);

        if (i > 0) {
          const prev = branch[i - 1];
          addEdge(nodeKey(prev, line.id), {
            toStation: st,
            toLineId: line.id,
            cost: line.secondsPerStop,
            isTransfer: false,
          });
          addEdge(nodeKey(st, line.id), {
            toStation: prev,
            toLineId: line.id,
            cost: line.secondsPerStop,
            isTransfer: false,
          });
        }
      }

      if (branchIdx === 0 && line.circularFirstBranch && branch.length > 2) {
        const first = branch[0];
        const last = branch[branch.length - 1];
        addEdge(nodeKey(last, line.id), {
          toStation: first,
          toLineId: line.id,
          cost: line.secondsPerStop,
          isTransfer: false,
        });
        addEdge(nodeKey(first, line.id), {
          toStation: last,
          toLineId: line.id,
          cost: line.secondsPerStop,
          isTransfer: false,
        });
      }
    });
  }

  // 같은 역 이름을 공유하는 노선 간 환승 간선 연결
  for (const [station, lines] of stationLineMap.entries()) {
    const arr = [...lines];
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        addEdge(nodeKey(station, arr[i]), {
          toStation: station,
          toLineId: arr[j],
          cost: TRANSFER_PENALTY_SECONDS,
          isTransfer: true,
        });
        addEdge(nodeKey(station, arr[j]), {
          toStation: station,
          toLineId: arr[i],
          cost: TRANSFER_PENALTY_SECONDS,
          isTransfer: true,
        });
      }
    }
  }

  stationLineMapCache = stationLineMap;
  graphCache = graph;
  return { stationLineMap, graph };
}

/** 환승역 중복을 제외한 수도권 전체 역 목록 (가나다순, 최초 호출 시 생성 후 캐시) */
export function getAllStations(): readonly StationInfo[] {
  if (!allStationsCache) {
    const { stationLineMap } = ensureSubwayGraph();
    allStationsCache = [...stationLineMap.entries()]
      .map(([name, set]) => ({ name, lineIds: [...set] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  return allStationsCache;
}

export type RouteStep = {
  station: string;
  lineId: string;
  lineName: string;
  lineColor: string;
  /** 이 역에서 직전 노선에서 환승했는지 여부 */
  isTransfer: boolean;
  /** 출발역 기준 누적 소요 시간(초) */
  cumulativeSeconds: number;
};

export type SubwayPath = {
  steps: RouteStep[];
  totalSeconds: number;
  stopsCount: number;
  transferCount: number;
};

/**
 * 출발역 → 종착역 최단 시간 경로를 다익스트라(Dijkstra)로 계산한다.
 * 환승이 필요하면 환승 구간도 함께 반환한다.
 */
export function findSubwayPath(startStation: string, endStation: string): SubwayPath | null {
  if (!startStation || !endStation || startStation === endStation) return null;
  const { stationLineMap, graph } = ensureSubwayGraph();
  const startLines = stationLineMap.get(startStation);
  const endLines = stationLineMap.get(endStation);
  if (!startLines || !endLines) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, { fromKey: string; isTransfer: boolean }>();
  const visited = new Set<string>();
  // 간단한 우선순위 큐(650여 역 규모라 선형 최소 추출도 1ms 미만)
  const queue: { key: string; station: string; lineId: string; cost: number }[] = [];

  for (const lineId of startLines) {
    const k = nodeKey(startStation, lineId);
    dist.set(k, 0);
    queue.push({ key: k, station: startStation, lineId, cost: 0 });
  }

  let bestEndKey: string | null = null;

  while (queue.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[minIdx].cost) minIdx = i;
    }
    const curr = queue.splice(minIdx, 1)[0];
    if (visited.has(curr.key)) continue;
    visited.add(curr.key);

    if (curr.station === endStation) {
      bestEndKey = curr.key;
      break;
    }

    const edges = graph.get(curr.key);
    if (!edges) continue;

    for (const edge of edges) {
      const nextKey = nodeKey(edge.toStation, edge.toLineId);
      if (visited.has(nextKey)) continue;
      const nextCost = curr.cost + edge.cost;
      const known = dist.get(nextKey);
      if (known === undefined || nextCost < known) {
        dist.set(nextKey, nextCost);
        prev.set(nextKey, { fromKey: curr.key, isTransfer: edge.isTransfer });
        queue.push({
          key: nextKey,
          station: edge.toStation,
          lineId: edge.toLineId,
          cost: nextCost,
        });
      }
    }
  }

  if (!bestEndKey) return null;

  const rawChain: { station: string; lineId: string; isTransfer: boolean; cost: number }[] = [];
  let cursor: string | undefined = bestEndKey;
  while (cursor) {
    const [station, lineId] = cursor.split('@@');
    const info = prev.get(cursor);
    rawChain.push({
      station,
      lineId,
      isTransfer: info?.isTransfer ?? false,
      cost: dist.get(cursor) ?? 0,
    });
    cursor = info?.fromKey;
  }
  rawChain.reverse();

  // 환승 시 같은 역이 두 번 들어가므로, 환승 역은 하나의 스텝(새 노선 + isTransfer: true)으로 합친다.
  const steps: RouteStep[] = [];
  let transferCount = 0;
  for (let i = 0; i < rawChain.length; i++) {
    const item = rawChain[i];
    const line = getSubwayLine(item.lineId);
    if (item.isTransfer && steps.length > 0) {
      transferCount++;
      // 직전 동일 역 스텝을 환승 스텝으로 갱신
      steps[steps.length - 1] = {
        station: item.station,
        lineId: item.lineId,
        lineName: line.name,
        lineColor: line.color,
        isTransfer: true,
        cumulativeSeconds: item.cost,
      };
    } else {
      steps.push({
        station: item.station,
        lineId: item.lineId,
        lineName: line.name,
        lineColor: line.color,
        isTransfer: false,
        cumulativeSeconds: item.cost,
      });
    }
  }

  const totalSeconds = steps[steps.length - 1]?.cumulativeSeconds ?? 0;
  return {
    steps,
    totalSeconds,
    stopsCount: Math.max(1, steps.length - 1),
    transferCount,
  };
}
