// 구별 타일 색 띠 (부루마블 땅 색깔처럼 구를 8묶음으로 나눠 색을 준다). 화면(브라우저)에서도 쓰므로 가볍게 유지한다.

const GROUPS: [string, string[]][] = [
  ["#A0522D", ["종로구", "중구"]],
  ["#87CEEB", ["용산구", "성동구", "광진구"]],
  ["#F4A6C8", ["동대문구", "중랑구", "성북구"]],
  ["#FFA64D", ["강북구", "도봉구", "노원구"]],
  ["#EF5350", ["은평구", "서대문구", "마포구", "양천구"]],
  ["#FFD54F", ["강서구", "구로구", "금천구"]],
  ["#66BB6A", ["영등포구", "동작구", "관악구"]],
  ["#5C6BC0", ["서초구", "강남구", "송파구", "강동구"]],
];

const COLOR_BY_DISTRICT: Record<string, string> = Object.fromEntries(GROUPS.flatMap(([color, names]) => names.map((name) => [name, color])));

/** 구 이름 → 타일 색 (모르는 이름은 회색) */
export function districtColor(name: string): string {
  return COLOR_BY_DISTRICT[name] ?? "#B4B2A9";
}

/** 타일에 보여주는 짧은 이름: "강남구" → "강남" ("중구"는 그대로) */
export function shortDistrictName(name: string): string {
  return name.length > 2 ? name.slice(0, -1) : name;
}
