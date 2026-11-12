// 결과 영역: 건수, 엑셀 내려받기, 안내 문구, 후보 표 (PLAN 작업 10·12)
// Design Ref: §6.1 ③, §6.4 — 후보·확인 필요 건수, 엑셀 버튼, 표(주소·지번·지목·면적·용도지역·선별 근거), 0건 안내, 상위 500건 안내

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
    <section
      aria-labelledby="result-heading"
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-6"
    >
      <h2 id="result-heading" className="text-base font-semibold">
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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">‘기본 조건으로 실행’을 누르면 결과가 여기에 나와요.</p>
      </div>
    );
  }
  if (state.status === "loading") {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">처리 중…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          후보 <strong className="text-base">{result.candidateTotal.toLocaleString("ko-KR")}건</strong>
          <span className="mx-2 text-zinc-400" aria-hidden="true">
            ·
          </span>
          확인 필요 <strong className="text-base">{result.needsCheckTotal.toLocaleString("ko-KR")}건</strong>
        </p>
        <button
          type="button"
          onClick={() => onDownload(result.conditions)}
          disabled={!canDownload || downloading}
          className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-transparent px-5 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:disabled:text-zinc-600"
        >
          {downloading ? "엑셀 만드는 중…" : "엑셀 내려받기"}
        </button>
      </div>

      {/* 말로 조건을 바꿔 실행할 수 있으므로, 이 결과가 어떤 조건의 것인지 보여준다 (엑셀 상단과 같은 문구) */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium">적용한 조건</span> {formatConditions(result.conditions)}
      </p>

      {download.status === "error" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {download.message}
        </p>
      )}

      {result.needsCheckTotal > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          확인 필요는 지목·면적·용도지역 값이 비어 있어 판정하지 못한 필지예요. 후보에는 포함되지 않아요.
        </p>
      )}

      {result.candidateTotal === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          조건에 맞는 필지가 없어요. 조건을 완화해 보세요.
        </p>
      ) : (
        <>
          {result.candidateTotal > MAX_DISPLAY_ROWS && (
            <p className="rounded-2xl bg-white/[0.06] px-4 py-2 text-sm text-zinc-200">
              화면에는 상위 {MAX_DISPLAY_ROWS}건만 보여요. 전체는 엑셀로 받으세요.
            </p>
          )}
          <div className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <caption className="sr-only">
                개발 대상지 후보 목록 (면적이 큰 순서, 상위 {result.candidates.length}건)
              </caption>
              <thead className="sticky top-0 bg-zinc-100 text-xs whitespace-nowrap text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">주소</th>
                  <th scope="col" className="px-3 py-2 font-semibold">지번</th>
                  <th scope="col" className="px-3 py-2 font-semibold">지목</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">면적(㎡)</th>
                  <th scope="col" className="px-3 py-2 font-semibold">용도지역</th>
                  <th scope="col" className="px-3 py-2 font-semibold">소유구분</th>
                  <th scope="col" className="px-3 py-2 font-semibold">선별 근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.candidates.map((c) => (
                  <tr key={c.pnu} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-3 py-2">{c.address}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.jibun}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.landCategory}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{areaFormat.format(c.area ?? 0)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.zone1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ownerText(c) ?? "-"}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">{DISCLAIMER}</p>
    </div>
  );
}
