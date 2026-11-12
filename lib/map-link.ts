// 필지 주소로 네이버지도를 여는 링크 만들기. 화면(브라우저)에서도 쓰므로 가볍게 유지한다.
// 네이버지도 검색 주소(map.naver.com/p/search/…)에 "법정동까지의 주소 + 지번"을 넣으면 그 필지 위치로 열린다.
// 열린 지도에서 "위성"을 누르면 위성사진을 볼 수 있다. (키나 가입이 필요 없는 바깥 링크이고, 우리 데이터는 네이버로 보내지 않는다 —
// 주소 글자만 사용자가 누른 링크 주소에 들어간다.)

/** 네이버지도 검색 주소를 만든다. 예: ("서울특별시 송파구 가락동", "913") → https://map.naver.com/p/search/서울특별시%20송파구%20가락동%20913 */
export function naverMapUrl(address: string, jibun: string): string {
  const query = `${address} ${jibun}`.replace(/\s+/g, " ").trim();
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}
