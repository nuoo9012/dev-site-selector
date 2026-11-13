// 주소 검색어 해석 — "송파구 가락동 913" 같은 지번 주소를 (동·구 이름 조각들 + 지번)으로 나눈다.
// 서버(API)에서 쓰고, 순수 계산이라 자동 검사(address-search.test.ts)로 확인한다.
// 지번 주소만 지원한다(도로명주소는 원본 자료에 없음). 지번이 꼭 있어야 필지 하나를 찾을 수 있다.

/** 검색어 최대 글자 수 (서버 보호) */
export const MAX_ADDRESS_QUERY_LENGTH = 100;

export type AddressQuery =
  | { ok: true; /** 주소에 들어 있어야 하는 글자 조각(SQL LIKE 형태) */ patterns: string[]; /** 공백 없는 지번 (예: "913", "산89-2") */ jibun: string }
  | { ok: false; message: string };

const EXAMPLE = "예: 송파구 가락동 913";

/**
 * 검색어를 해석한다.
 *  - "서울특별시"·"서울시"·"서울"은 무시한다 (대상이 서울뿐이라서).
 *  - 맨 끝의 숫자(와 "산", 부번 "-")를 지번으로 보고, 나머지 낱말은 모두 주소에 들어 있어야 한다.
 *  - LIKE 검색에서 특별한 뜻을 가진 글자(%, _, \)는 애초에 허용하지 않는 글자라 지워서, 검색어로 검색 범위를 넓힐 수 없다.
 */
export function parseAddressQuery(input: unknown): AddressQuery {
  if (typeof input !== "string") return { ok: false, message: `주소를 글자로 입력해 주세요. ${EXAMPLE}` };
  const text = input.normalize("NFC").replace(/[,，]/g, " ").replace(/\s+/g, " ").trim().replace(/번지$/, "").trim();
  if (text.length < 1 || text.length > MAX_ADDRESS_QUERY_LENGTH) return { ok: false, message: `1~${MAX_ADDRESS_QUERY_LENGTH}자로 입력해 주세요. ${EXAMPLE}` };

  // 맨 끝의 지번: [산] 본번[-부번]
  // (앞부분은 가장 짧게, 나머지가 지번이 되도록 읽는다)
  const match = /^(.*?)(산\s*)?(\d{1,4})(?:-(\d{1,4}))?$/.exec(text);
  if (!match) return { ok: false, message: `지번까지 함께 적어 주세요. ${EXAMPLE}` };
  const main = String(Number(match[3])); // 앞의 0 제거 ("0913" → "913")
  const sub = match[4] !== undefined ? String(Number(match[4])) : undefined;
  const jibun = `${match[2] ? "산" : ""}${main}${sub !== undefined ? `-${sub}` : ""}`;

  // 지번 앞부분이 주소 조각들이다
  const tokens = match[1]
    .split(" ")
    .map((token) => token.replace(/[^가-힣A-Za-z0-9·-]/g, "")) // 허용하지 않는 글자(%, _, \ 등)는 지운다
    .filter((token) => token.length > 0 && !/^서울(특별시|시)?$/.test(token));
  if (tokens.length === 0) return { ok: false, message: `동 이름까지 함께 적어 주세요. ${EXAMPLE}` };
  if (tokens.length > 6 || tokens.some((token) => token.length > 20)) return { ok: false, message: `주소가 너무 길어요. ${EXAMPLE}` };

  return { ok: true, patterns: tokens.map((token) => `%${token}%`), jibun };
}
