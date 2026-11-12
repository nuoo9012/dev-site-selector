// 소유구분 표시 글 — 화면(브라우저)과 엑셀(서버)이 같은 글을 쓰도록 한곳에 둔다. 가볍게 유지한다.

import type { Parcel } from "./types";

/** 소유구분 글: 목록을 가운뎃점으로 잇고, 국유지에 기관이 있으면 괄호로 붙인다. 소유정보가 없으면 null */
export function ownerText(p: Pick<Parcel, "owners" | "ownerAgency">): string | null {
  if (!p.owners || p.owners.length === 0) return null;
  return p.owners.join("·") + (p.ownerAgency ? `(${p.ownerAgency})` : "");
}
