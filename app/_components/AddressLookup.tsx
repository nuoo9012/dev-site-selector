"use client";

// 주소로 필지 찾기: 지번 주소(예: 송파구 가락동 913)를 입력하면 그 필지의 정보를 카드로 보여준다
// 선별 조건과는 별개로 동작한다. 찾은 필지는 네이버지도 새 창으로도 열 수 있다.

import { useRef, useState } from "react";
import { formatWon, formatWonApprox, landValue, LAND_VALUE_NOTE } from "@/lib/land-value";
import { naverMapUrl } from "@/lib/map-link";
import { ownerText } from "@/lib/owner-text";
import type { ApiError, LookupResponse } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; query: string; result: LookupResponse };

const areaFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const EMPTY = "정보 없음";

export function AddressLookup() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  // 같은 순간에 두 번 눌러도 요청이 한 번만 나가게 한다
  const searching = useRef(false);

  async function search() {
    const text = query.trim();
    if (searching.current || text === "") return;
    searching.current = true;
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setState({ status: "error", message: (body as ApiError | null)?.error?.message ?? "필지를 찾지 못했어요. 잠시 뒤 다시 시도해 주세요." });
        return;
      }
      setState({ status: "done", query: text, result: (await response.json()) as LookupResponse });
    } catch {
      setState({ status: "error", message: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      searching.current = false;
    }
  }

  return (
    <section aria-labelledby="lookup-heading" className="nb-card p-4 sm:p-5">
      <h2 id="lookup-heading" className="nb-jua text-xl">
        주소로 필지 찾기
      </h2>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label htmlFor="lookup-query" className="sr-only">
          지번 주소
        </label>
        <input
          id="lookup-query"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예) 송파구 가락동 913"
          maxLength={100}
          autoComplete="off"
          className="nb-input min-w-[220px] flex-1"
        />
        <button type="submit" disabled={query.trim() === "" || state.status === "loading"} className="nb-btn nb-jua">
          {state.status === "loading" ? "찾는 중…" : "필지 찾기"}
        </button>
      </form>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">동 이름과 지번까지 적어 주세요. 도로명주소는 찾을 수 없어요. (산 번지는 “방학동 산 89-2”처럼)</p>

      <div aria-live="polite" className="mt-3">
        {state.status === "error" && (
          <p role="alert" className="nb-alert nb-alert-error">
            {state.message}
          </p>
        )}
        {state.status === "done" && state.result.parcels.length === 0 && (
          <p className="nb-alert nb-alert-warn">“{state.query}”에 맞는 필지를 찾지 못했어요. 동 이름과 지번을 다시 확인해 주세요.</p>
        )}
        {state.status === "done" && state.result.parcels.length > 0 && (
          <div className="flex flex-col gap-3">
            {state.result.truncated && <p className="nb-alert nb-alert-info">맞는 필지가 많아서 {state.result.parcels.length}건만 보여요. 구 이름을 함께 적어 보세요.</p>}
            {state.result.parcels.map((p) => (
              <article key={p.pnu} className="nb-card-flat p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="nb-jua text-lg">
                    {p.address} {p.jibun}
                  </h3>
                  <a
                    href={naverMapUrl(p.address, p.jibun)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${p.address} ${p.jibun} 네이버지도에서 보기 (새 창)`}
                    className="nb-chip nb-chip-link"
                  >
                    지도
                  </a>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
                  <dt className="text-[var(--ink-soft)]">지목</dt>
                  <dd className="font-bold">{p.landCategory ?? EMPTY}</dd>
                  <dt className="text-[var(--ink-soft)]">면적</dt>
                  <dd className="font-bold tabular-nums">{p.area === null ? EMPTY : `${areaFormat.format(p.area)}㎡`}</dd>
                  <dt className="text-[var(--ink-soft)]">용도지역</dt>
                  <dd className="font-bold">
                    {p.zone1 ?? EMPTY}
                    {p.zone2 && <span className="font-normal text-[var(--ink-soft)]"> (일부 {p.zone2} 걸침)</span>}
                  </dd>
                  <dt className="text-[var(--ink-soft)]">소유구분</dt>
                  <dd className="font-bold">{ownerText(p) ?? EMPTY}</dd>
                  <dt className="text-[var(--ink-soft)]">토지이용상황</dt>
                  <dd className="font-bold">{p.landUse ?? EMPTY}</dd>
                  <dt className="text-[var(--ink-soft)]">지형형상</dt>
                  <dd className="font-bold">{p.landShape ?? EMPTY}</dd>
                  <dt className="text-[var(--ink-soft)]">공시지가</dt>
                  <dd className="font-bold tabular-nums">
                    {p.landPrice != null ? `${formatWon(p.landPrice)}/㎡` : EMPTY}
                    {p.landPrice != null && p.landPriceYear != null && <span className="font-normal text-[var(--ink-soft)]"> ({p.landPriceYear}년)</span>}
                  </dd>
                  <dt className="text-[var(--ink-soft)]">토지가액</dt>
                  <dd className="font-bold tabular-nums">
                    {formatWon(landValue(p)) ?? EMPTY}
                    {formatWonApprox(landValue(p)) && <span className="font-normal text-[var(--ink-soft)]"> ({formatWonApprox(landValue(p))})</span>}
                  </dd>
                  <dt className="text-[var(--ink-soft)]">고유번호</dt>
                  <dd className="tabular-nums text-[var(--ink-soft)]">{p.pnu}</dd>
                </dl>
              </article>
            ))}
            <p className="text-xs text-[var(--ink-soft)]">{LAND_VALUE_NOTE}</p>
          </div>
        )}
      </div>
    </section>
  );
}
