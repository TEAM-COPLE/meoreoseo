/**
 * 인천국제공항(ICN) 출발 전 세계 142개 목적지 공항 데이터.
 * 위도·경도로 실제 대권 거리(km)와 예상 비행 시간(분)을 자동 계산한다.
 */

export type FlightRegion =
  | '국내'
  | '동아시아'
  | '동남아시아'
  | '중앙·서남·중동'
  | '유럽'
  | '미주'
  | '대양주·아프리카';

export const FLIGHT_REGIONS: readonly ('전체' | FlightRegion)[] = [
  '전체',
  '국내',
  '동아시아',
  '동남아시아',
  '중앙·서남·중동',
  '유럽',
  '미주',
  '대양주·아프리카',
];

export type FlightRoute = {
  id: string;
  region: FlightRegion;
  country: string;
  codeFrom: string;
  cityFrom: string;
  fromLat: number;
  fromLng: number;
  codeTo: string;
  cityTo: string;
  cityToEn: string;
  toLat: number;
  toLng: number;
  flightNo: string;
  minutes: number;
  /** 초 단위 비행 시간 (30초 테스트 노선 등 분 미만 노선용) */
  seconds?: number;
  distanceKm: number;
  /** 공항 코드 검색으로만 노출되는 숨김 노선 여부 */
  secret?: boolean;
};

type RawAirport = readonly [
  code: string,
  cityKo: string,
  cityEn: string,
  country: string,
  region: FlightRegion,
  lat: number,
  lng: number,
];

const ICN_LAT = 37.4602;
const ICN_LNG = 126.4407;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** 실제 항공기 순항 속도(약 780km/h) + 이착륙 시간(25분)을 기준으로 5분 단위 비행 시간을 구한다. */
function estimateFlightMinutes(distanceKm: number): number {
  const raw = (distanceKm / 780) * 60 + 25;
  return Math.max(25, Math.round(raw / 5) * 5);
}

const RAW_AIRPORTS: readonly RawAirport[] = [
  // 국내 (1곳)
  ['CJU', '제주', 'Jeju', '대한민국', '국내', 33.5113, 126.493],

  // 1. 동아시아 - 일본 (26곳)
  ['NRT', '도쿄 나리타', 'Tokyo Narita', '일본', '동아시아', 35.772, 140.3929],
  ['HND', '도쿄 하네다', 'Tokyo Haneda', '일본', '동아시아', 35.5494, 139.7798],
  ['KIX', '오사카 간사이', 'Osaka Kansai', '일본', '동아시아', 34.4347, 135.244],
  ['UKB', '오사카 고베', 'Kobe', '일본', '동아시아', 34.6328, 135.2239],
  ['NGO', '나고야 주부', 'Nagoya Chubu', '일본', '동아시아', 34.8584, 136.8054],
  ['FUK', '후쿠오카', 'Fukuoka', '일본', '동아시아', 33.5859, 130.451],
  ['CTS', '삿포로 신치토세', 'Sapporo Chitose', '일본', '동아시아', 42.7752, 141.6923],
  ['OKA', '오키나와 나하', 'Okinawa Naha', '일본', '동아시아', 26.1958, 127.6459],
  ['KOJ', '가고시마', 'Kagoshima', '일본', '동아시아', 31.8034, 130.7194],
  ['KMJ', '구마모토', 'Kumamoto', '일본', '동아시아', 32.8373, 130.8551],
  ['KKJ', '기타큐슈', 'Kitakyushu', '일본', '동아시아', 33.8459, 131.0347],
  ['NGS', '나가사키', 'Nagasaki', '일본', '동아시아', 32.9169, 129.9136],
  ['KIJ', '니가타', 'Niigata', '일본', '동아시아', 37.9558, 139.1114],
  ['TKS', '도쿠시마', 'Tokushima', '일본', '동아시아', 34.1328, 134.6067],
  ['MYJ', '마쓰야마', 'Matsuyama', '일본', '동아시아', 33.8272, 132.6997],
  ['HSG', '사가', 'Saga', '일본', '동아시아', 33.1497, 130.3022],
  ['SDJ', '센다이', 'Sendai', '일본', '동아시아', 38.1397, 140.9169],
  ['FSZ', '시즈오카', 'Shizuoka', '일본', '동아시아', 34.7961, 138.1894],
  ['AOJ', '아오모리', 'Aomori', '일본', '동아시아', 40.7347, 140.6908],
  ['OBO', '오비히로', 'Obihiro', '일본', '동아시아', 42.7333, 143.2172],
  ['OIT', '오이타', 'Oita', '일본', '동아시아', 33.4794, 131.7372],
  ['OKJ', '오카야마', 'Okayama', '일본', '동아시아', 34.7569, 133.8553],
  ['IBR', '이바라키', 'Ibaraki', '일본', '동아시아', 36.1811, 140.4156],
  ['KMQ', '코마츠', 'Komatsu', '일본', '동아시아', 36.3946, 136.4065],
  ['TAK', '타카마츠', 'Takamatsu', '일본', '동아시아', 34.2142, 134.0156],
  ['HKD', '하코다테', 'Hakodate', '일본', '동아시아', 41.77, 140.822],

  // 1. 동아시아 - 중국 본토 (31곳)
  ['PEK', '베이징 서우두', 'Beijing Capital', '중국', '동아시아', 40.0799, 116.6031],
  ['PKX', '베이징 다싱', 'Beijing Daxing', '중국', '동아시아', 39.5098, 116.4105],
  ['PVG', '상하이 푸둥', 'Shanghai Pudong', '중국', '동아시아', 31.1443, 121.8083],
  ['CAN', '광저우', 'Guangzhou', '중국', '동아시아', 23.3924, 113.2988],
  ['SZX', '선전', 'Shenzhen', '중국', '동아시아', 22.6393, 113.8107],
  ['TAO', '칭다오', 'Qingdao', '중국', '동아시아', 36.3661, 120.0886],
  ['YNT', '옌타이', 'Yantai', '중국', '동아시아', 37.6596, 120.9857],
  ['WEH', '웨이하이', 'Weihai', '중국', '동아시아', 37.1871, 122.2287],
  ['DLC', '다롄', 'Dalian', '중국', '동아시아', 38.9657, 121.5386],
  ['SHE', '선양', 'Shenyang', '중국', '동아시아', 41.6398, 123.4834],
  ['HRB', '하얼빈', 'Harbin', '중국', '동아시아', 45.6234, 126.2503],
  ['CGQ', '창춘', 'Changchun', '중국', '동아시아', 43.9962, 125.6849],
  ['YNJ', '옌지(연길)', 'Yanji', '중국', '동아시아', 42.8828, 129.4513],
  ['TSN', '톈진', 'Tianjin', '중국', '동아시아', 39.1244, 117.3462],
  ['TNA', '지난', 'Jinan', '중국', '동아시아', 36.8572, 117.216],
  ['NKG', '난징', 'Nanjing', '중국', '동아시아', 31.742, 118.862],
  ['HGH', '항저우', 'Hangzhou', '중국', '동아시아', 30.2295, 120.4345],
  ['NGB', '닝보', 'Ningbo', '중국', '동아시아', 29.8267, 121.4619],
  ['WNZ', '원저우', 'Wenzhou', '중국', '동아시아', 27.9122, 120.8519],
  ['WUX', '우시', 'Wuxi', '중국', '동아시아', 31.4944, 120.4294],
  ['YTY', '양저우', 'Yangzhou', '중국', '동아시아', 32.5633, 119.7197],
  ['XMN', '샤먼', 'Xiamen', '중국', '동아시아', 24.544, 118.1277],
  ['XIY', '시안', 'Xian', '중국', '동아시아', 34.4471, 108.7516],
  ['TFU', '청두 톈푸', 'Chengdu Tianfu', '중국', '동아시아', 30.3125, 104.4413],
  ['CKG', '충칭', 'Chongqing', '중국', '동아시아', 29.7192, 106.6417],
  ['WUH', '우한', 'Wuhan', '중국', '동아시아', 30.7838, 114.2081],
  ['CSX', '창사', 'Changsha', '중국', '동아시아', 28.1892, 113.2196],
  ['CGO', '정저우', 'Zhengzhou', '중국', '동아시아', 34.5197, 113.8409],
  ['KMG', '쿤밍', 'Kunming', '중국', '동아시아', 25.1019, 102.9292],
  ['HAK', '하이커우', 'Haikou', '중국', '동아시아', 19.9349, 110.459],
  ['DYG', '장자제', 'Zhangjiajie', '중국', '동아시아', 29.1028, 110.4431],

  // 1. 동아시아 - 홍콩 · 마카오 · 대만 · 몽골 (6곳)
  ['HKG', '홍콩', 'Hong Kong', '홍콩', '동아시아', 22.308, 113.9185],
  ['MFM', '마카오', 'Macau', '마카오', '동아시아', 22.1496, 113.5915],
  ['TPE', '타이베이 타오위안', 'Taipei Taoyuan', '대만', '동아시아', 25.0797, 121.2342],
  ['KHH', '가오슝', 'Kaohsiung', '대만', '동아시아', 22.5771, 120.35],
  ['RMQ', '타이중', 'Taichung', '대만', '동아시아', 24.2647, 120.6206],
  ['UBN', '울란바타르 칭기즈 칸', 'Ulaanbaatar', '몽골', '동아시아', 47.6469, 106.8198],

  // 2. 동남아시아 (24곳)
  ['HAN', '하노이', 'Hanoi', '베트남', '동남아시아', 21.2212, 105.8072],
  ['SGN', '호찌민', 'Ho Chi Minh City', '베트남', '동남아시아', 10.8188, 106.6519],
  ['DAD', '다낭', 'Da Nang', '베트남', '동남아시아', 16.0439, 108.1994],
  ['CXR', '나트랑 깜라인', 'Nha Trang Cam Ranh', '베트남', '동남아시아', 11.9982, 109.2194],
  ['PQC', '푸꾸옥', 'Phu Quoc', '베트남', '동남아시아', 10.1698, 103.9931],
  ['HPH', '하이퐁', 'Hai Phong', '베트남', '동남아시아', 20.8194, 106.7248],
  ['BKK', '방콕 수완나품', 'Bangkok Suvarnabhumi', '태국', '동남아시아', 13.69, 100.7501],
  ['DMK', '방콕 돈므앙', 'Bangkok Don Mueang', '태국', '동남아시아', 13.9126, 100.6067],
  ['CNX', '치앙마이', 'Chiang Mai', '태국', '동남아시아', 18.7668, 98.9626],
  ['HKT', '푸껫', 'Phuket', '태국', '동남아시아', 8.1132, 98.3169],
  ['MNL', '마닐라', 'Manila', '필리핀', '동남아시아', 14.5086, 121.0198],
  ['CEB', '세부', 'Cebu', '필리핀', '동남아시아', 10.3075, 123.9794],
  ['CRK', '클라크', 'Clark', '필리핀', '동남아시아', 15.186, 120.5603],
  ['TAG', '보홀 팡라오', 'Bohol Panglao', '필리핀', '동남아시아', 9.5764, 123.7744],
  ['KLO', '보라카이 칼리보', 'Kalibo', '필리핀', '동남아시아', 11.6794, 122.3763],
  ['CGK', '자카르타 수카르노 하타', 'Jakarta', '인도네시아', '동남아시아', -6.1256, 106.6559],
  ['DPS', '덴파사르 발리', 'Bali Denpasar', '인도네시아', '동남아시아', -8.7482, 115.1672],
  ['MDC', '마나도', 'Manado', '인도네시아', '동남아시아', 1.5493, 124.9261],
  ['KUL', '쿠알라룸푸르', 'Kuala Lumpur', '말레이시아', '동남아시아', 2.7456, 101.7099],
  ['BKI', '코타키나발루', 'Kota Kinabalu', '말레이시아', '동남아시아', 5.9372, 116.0512],
  ['SIN', '싱가포르 창이', 'Singapore Changi', '싱가포르', '동남아시아', 1.3644, 103.9915],
  ['VTE', '비엔티안', 'Vientiane', '라오스', '동남아시아', 17.9883, 102.5633],
  ['PNH', '프놈펜', 'Phnom Penh', '캄보디아', '동남아시아', 11.5466, 104.8441],
  ['RGN', '양곤', 'Yangon', '미얀마', '동남아시아', 16.9073, 96.1332],

  // 3. 중앙아시아 · 서남아시아 · 중동 (11곳)
  ['TAS', '타슈켄트', 'Tashkent', '우즈베키스탄', '중앙·서남·중동', 41.2579, 69.2812],
  ['ALA', '알마티', 'Almaty', '카자흐스탄', '중앙·서남·중동', 43.3521, 77.0405],
  ['NQZ', '아스타나', 'Astana', '카자흐스탄', '중앙·서남·중동', 51.0222, 71.4669],
  ['DEL', '델리 인디라 간디', 'Delhi', '인도', '중앙·서남·중동', 28.5562, 77.1],
  ['CMB', '콜롬보 반다라나이케', 'Colombo', '스리랑카', '중앙·서남·중동', 7.1808, 79.8841],
  ['KTM', '카트만두', 'Kathmandu', '네팔', '중앙·서남·중동', 27.6966, 85.3591],
  ['DXB', '두바이', 'Dubai', '아랍에미리트', '중앙·서남·중동', 25.2532, 55.3657],
  ['AUH', '아부다비', 'Abu Dhabi', '아랍에미리트', '중앙·서남·중동', 24.433, 54.6511],
  ['DOH', '도하 하마드', 'Doha Hamad', '카타르', '중앙·서남·중동', 25.2731, 51.6081],
  ['RUH', '리야드', 'Riyadh', '사우디아라비아', '중앙·서남·중동', 24.9576, 46.6988],
  ['TLV', '텔아비브', 'Tel Aviv', '이스라엘', '중앙·서남·중동', 32.0114, 34.8867],

  // 4. 유럽 (17곳)
  ['LHR', '런던 히스로', 'London Heathrow', '영국', '유럽', 51.47, -0.4543],
  ['CDG', '파리 샤를 드 골', 'Paris Charles de Gaulle', '프랑스', '유럽', 49.0097, 2.5479],
  ['FRA', '프랑크푸르트', 'Frankfurt', '독일', '유럽', 50.0379, 8.5622],
  ['MUC', '뮌헨', 'Munich', '독일', '유럽', 48.3537, 11.775],
  ['AMS', '암스테르담 스키폴', 'Amsterdam Schiphol', '네덜란드', '유럽', 52.3105, 4.7683],
  ['ZRH', '취리히', 'Zurich', '스위스', '유럽', 47.4647, 8.5492],
  ['FCO', '로마 피우미치노', 'Rome Fiumicino', '이탈리아', '유럽', 41.8003, 12.2389],
  ['MXP', '밀라노 말펜사', 'Milan Malpensa', '이탈리아', '유럽', 45.6306, 8.7281],
  ['MAD', '마드리드 바라하스', 'Madrid Barajas', '스페인', '유럽', 40.4983, -3.5676],
  ['BCN', '바르셀로나', 'Barcelona', '스페인', '유럽', 41.2974, 2.0833],
  ['LIS', '리스본', 'Lisbon', '포르투갈', '유럽', 38.7756, -9.1354],
  ['IST', '이스탄불', 'Istanbul', '튀르키예', '유럽', 41.2753, 28.7519],
  ['PRG', '프라하', 'Prague', '체코', '유럽', 50.1008, 14.26],
  ['BUD', '부다페스트', 'Budapest', '헝가리', '유럽', 47.4369, 19.2556],
  ['WAW', '바르샤바', 'Warsaw', '폴란드', '유럽', 52.1657, 20.9671],
  ['HEL', '헬싱키 반타', 'Helsinki Vantaa', '핀란드', '유럽', 60.3172, 24.9633],
  ['CPH', '코펜하겐', 'Copenhagen', '덴마크', '유럽', 55.618, 12.656],

  // 5. 미주 (17곳)
  ['JFK', '뉴욕 JFK', 'New York JFK', '미국', '미주', 40.6413, -73.7781],
  ['EWR', '뉴욕 뉴어크', 'Newark', '미국', '미주', 40.6895, -74.1745],
  ['LAX', '로스앤젤레스', 'Los Angeles', '미국', '미주', 33.9416, -118.4085],
  ['SFO', '샌프란시스코', 'San Francisco', '미국', '미주', 37.6213, -122.379],
  ['SEA', '시애틀', 'Seattle', '미국', '미주', 47.4502, -122.3088],
  ['LAS', '라스베이거스', 'Las Vegas', '미국', '미주', 36.084, -115.1537],
  ['ORD', '시카고 오헤어', 'Chicago OHare', '미국', '미주', 41.9742, -87.9073],
  ['DFW', '댈러스 포트워스', 'Dallas Fort Worth', '미국', '미주', 32.8998, -97.0403],
  ['ATL', '애틀랜타', 'Atlanta', '미국', '미주', 33.6407, -84.4277],
  ['IAD', '워싱턴 D.C. 덜레스', 'Washington Dulles', '미국', '미주', 38.9531, -77.4565],
  ['BOS', '보스턴', 'Boston', '미국', '미주', 42.3656, -71.0096],
  ['DTW', '디트로이트', 'Detroit', '미국', '미주', 42.2162, -83.3554],
  ['MSP', '미니애폴리스', 'Minneapolis', '미국', '미주', 44.8848, -93.2223],
  ['SLC', '솔트레이크시티', 'Salt Lake City', '미국', '미주', 40.7899, -111.9791],
  ['YVR', '밴쿠버', 'Vancouver', '캐나다', '미주', 49.1967, -123.1815],
  ['YYZ', '토론토 피어슨', 'Toronto Pearson', '캐나다', '미주', 43.6777, -79.6248],
  ['MEX', '멕시코시티', 'Mexico City', '멕시코', '미주', 19.4363, -99.0721],

  // 6. 대양주 · 태평양 · 아프리카 (9곳)
  ['SYD', '시드니 킹스포드 스미스', 'Sydney', '호주', '대양주·아프리카', -33.9399, 151.1753],
  ['MEL', '멜버른', 'Melbourne', '호주', '대양주·아프리카', -37.669, 144.841],
  ['BNE', '브리즈번', 'Brisbane', '호주', '대양주·아프리카', -27.3842, 153.1175],
  ['AKL', '오클랜드', 'Auckland', '뉴질랜드', '대양주·아프리카', -37.0082, 174.785],
  ['HNL', '호놀룰루 하와이', 'Honolulu', '미국', '대양주·아프리카', 21.3187, -157.9225],
  ['GUM', '괌', 'Guam', '미국령 괌', '대양주·아프리카', 13.4834, 144.796],
  ['SPN', '사이판', 'Saipan', '북마리아나', '대양주·아프리카', 15.119, 145.7294],
  ['ROR', '팔라우 코로르', 'Palau Koror', '팔라우', '대양주·아프리카', 7.3673, 134.5443],
  ['ADD', '아디스아바바 볼레', 'Addis Ababa', '에티오피아', '대양주·아프리카', 8.9779, 38.7993],
];

export const FLIGHT_ROUTES: readonly FlightRoute[] = RAW_AIRPORTS.map(
  ([code, cityKo, cityEn, country, region, lat, lng], idx) => {
    const distanceKm = haversineKm(ICN_LAT, ICN_LNG, lat, lng);
    const minutes = code === 'CJU' ? 60 : estimateFlightMinutes(distanceKm);
    const flightNum = code === 'CJU' ? 'KE 1201' : `KE ${String(101 + idx * 7).padStart(3, '0')}`;
    return {
      id: code.toLowerCase(),
      region,
      country,
      codeFrom: 'ICN',
      cityFrom: '인천',
      fromLat: ICN_LAT,
      fromLng: ICN_LNG,
      codeTo: code,
      cityTo: cityKo,
      cityToEn: cityEn,
      toLat: lat,
      toLng: lng,
      flightNo: flightNum,
      minutes,
      distanceKm,
    };
  },
);

/** 공항 검색창에 "Test"를 입력했을 때만 나타나는 30초 테스트용 비밀 노선 */
export const SECRET_TEST_FLIGHT_ROUTE: FlightRoute = {
  id: 'test',
  region: '국내',
  country: '테스트',
  codeFrom: 'ICN',
  cityFrom: '인천',
  fromLat: ICN_LAT,
  fromLng: ICN_LNG,
  codeTo: 'TST',
  cityTo: '테스트 비행',
  cityToEn: 'Test Flight',
  toLat: 37.5583,
  toLng: 126.7906,
  flightNo: 'KE 000',
  minutes: 0.5,
  seconds: 30,
  distanceKm: 33,
  secret: true,
};

/** 분을 "1시간 5분", "60분", 또는 1분 미만이면 "30초" 형식으로 짧게 바꾼다. */
export function formatFlightMinutes(minutes: number): string {
  if (minutes > 0 && minutes < 1) {
    return `${Math.round(minutes * 60)}초`;
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
