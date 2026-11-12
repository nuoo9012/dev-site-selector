// 결과 영역: 건수, 엑셀 내려받기, 안내 문구, 후보 표 (PLAN 작업 10·12)
// Design Ref: §6.1 ③, §6.4 — 후보·확인 필요 건수, 엑셀 버튼, 표(주소·지번·지목·면적·용도지역·선별 근거), 0건 안내, 상위 500건 안내
// 디자인: 후보(초록)·확인 필요(노랑) 숫자 카드 + 노란 머리글 표

import Image from "next/image";
import { ownerText } from "@/lib/owner-text";
import { DISCLAIMER, formatConditions } from "@/lib/format";
import { MAX_DISPLAY_ROWS, type Conditions } from "@/lib/types";
import type { DownloadState, RunState } from "./SelectorApp";

const areaFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

interface Props {
  state: RunState;
  download: DownloadState;
  /** 지금 적용된 조건으로 엑셀을 받는다 */
  onDownload: (conditions: Conditions) => void;
}

export function ResultTable({ state, download, onDownload }: Props) {
  return (
    <section aria-labelledby="result-heading" className="nb-card p-4 sm:p-5">
      <h2 id="result-heading" className="nb-jua text-xl">
        결과
      </h2>
      {/* 상태가 바뀔 때 화면 읽기 프로그램이 알려 주도록 aria-live를 둔다 */}
      <div aria-live="polite" className="mt-2">
        <Body state={state} download={download} onDownload={onDownload} />
      </div>
    </section>
  );
}

function Body({ state, download, onDownload }: Props) {
  if (state.status === "idle") {
    return (
      <div className="flex items-center gap-4">
        <Image src="/kiumi.png" alt="" width={899} height={1183} className="h-20 w-auto" />
        <p className="text-sm">‘기본 조건으로 실행’을 누르면 결과가 여기에 나와요.</p>
      </div>
    );
  }
  if (state.status === "loading") {
    return <p className="nb-jua text-base">주사위 굴리는 중…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="nb-alert nb-alert-error">
        {state.message}
      </p>
    );
  }

  const { result } = state;
  // 후보와 확인 필요를 합쳐 1건 이상이면 엑셀을 받을 수 있다 (Design Ref: §6.4 — 후보 0건이어도 확인 필요 시트는 받을 수 있게)
  const canDownload = result.candidateTotal + result.needsCheckTotal >= 1;
  const downloading = download.status === "loading";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="nb-stat min-w-[130px] text-white" style={{ background: "#66bb6a" }}>
          <div className="text-xs">후보</div>
          <div className="nb-jua text-2xl tabular-nums">{result.candidateTotal.toLocaleString("ko-KR")}건</div>
        </div>
        <div className="nb-stat min-w-[130px]" style={{ background: "#ffd54f" }}>
          <div className="text-xs">확인 필요</div>
          <div className="nb-jua text-2xl tabular-nums">{result.needsCheckTotal.toLocaleString("ko-KR")}건</div>
        </div>
        <div className="ml-auto flex items-center">
          <button type="button" onClick={() => onDownload(result.conditions)} disabled={!canDownload || downloading} className="nb-btn nb-btn-ghost nb-btn-small nb-jua">
            {downloading ? "엑셀 만드는 중…" : "엑셀 내려받기"}
          </button>
        </div>
      </div>

      {/* 말로 조건을 바꿔 실행할 수 있으므로, 이 결과가 어떤 조건의 것인지 보여준다 (엑셀 상단과 같은 문구) */}
      <p className="text-sm">
        <span className="font-bold">적용한 조건</span> {formatConditions(result.conditions)}
      </p>

      {download.status === "error" && (
        <p role="alert" className="nb-alert nb-alert-error">
          {download.message}
        </p>
      )}

      {result.needsCheckTotal > 0 && (
        <p className="text-sm text-[var(--ink-soft)]">확인 필요는 지목·면적·용도지역 값이 비어 있어 판정하지 못한 필지예요. 후보에는 포함되지 않아요.</p>
      )}

      {result.candidateTotal === 0 ? (
        <p className="nb-alert nb-alert-warn">조건에 맞는 필지가 없어요. 조건을 완화해 보세요.</p>
      ) : (
        <>
          {result.candidateTotal > MAX_DISPLAY_ROWS && (
            <p className="nb-alert nb-alert-info">
              화면에는 상위 {MAX_DISPLAY_ROWS}건만 보여요. 전체는 엑셀로 받으세요.
            </p>
          )}
          <div className="nb-table-wrap max-h-[70vh]">
            <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
              <caption className="sr-only">
                개발 대상지 후보 목록 (면적이 큰 순서, 상위 {result.candidates.length}건)
              </caption>
              <thead className="sticky top-0 text-xs whitespace-nowrap">
                <tr>
                  <th scope="col" className="min-w-[210px] px-3 py-2 font-bold">주소</th>
                  <th scope="col" className="px-3 py-2 font-bold">지번</th>
                  <th scope="col" className="px-3 py-2 font-bold">지목</th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">면적(㎡)</th>
                  <th scope="col" className="px-3 py-2 font-bold">용도지역</th>
                  <th scope="col" className="min-w-[130px] px-3 py-2 font-bold">소유구분</th>
                  <th scope="col" className="px-3 py-2 font-bold">토지이용상황</th>
                  <th scope="col" className="px-3 py-2 font-bold">지형형상</th>
                  <th scope="col" className="min-w-[260px] px-3 py-2 font-bold">선별 근거</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c) => (
                  <tr key={c.pnu}>
                    <td className="px-3 py-2 whitespace-nowrap">{c.address}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.jibun}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.landCategory}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{areaFormat.format(c.area ?? 0)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.zone1}</td>
                    <td className="px-3 py-2">{ownerText(c) ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.landUse ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.landShape ?? "-"}</td>
                    <td className="px-3 py-2 text-[var(--ink-soft)]">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-[var(--ink-soft)]">{DISCLAIMER}</p>
    </div>
  );
}
