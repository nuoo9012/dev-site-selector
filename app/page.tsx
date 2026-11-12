// 선별기 화면 (PLAN 작업 10)
// Design Ref: §6.1 — 머리글(제목·대상 지자체·데이터 기준일) + 조건 영역 + 결과 표
// 서울 확장: 필지는 데이터베이스에 있고, 화면에는 기준일·필지 수 요약만 서버에서 읽어 보여준다.
// 디자인: 귀여운 서울 부루마블 게임판 (크림색 바탕, 굵은 남색 테두리, 땅 타일 색 띠, 황금열쇠 카드)

import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
import { DISTRICTS } from "@/lib/conditions";
import { districtColor, shortDistrictName } from "@/lib/district-colors";
import { formatBaseDates } from "@/lib/format";
import { getSummary } from "@/lib/parcel-store";
import { SelectorApp } from "./_components/SelectorApp";

const number = new Intl.NumberFormat("ko-KR");

/** 요청 때마다(10분 메모리 보관) 데이터베이스에서 읽는다. 읽지 못하면 안내만 보여주고 화면은 계속 쓸 수 있게 한다 */
async function loadSummary() {
  await connection();
  try {
    return await getSummary();
  } catch {
    return null;
  }
}

async function BaseDateChip() {
  const summary = await loadSummary();
  return (
    <p className="rounded-full border-[2.5px] border-ink bg-[#ffe08a] px-4 py-1.5 text-xs sm:text-sm">
      서울 25개 구 · {summary ? formatBaseDates(summary.baseDates) : "데이터 기준일을 불러오지 못했어요"}
    </p>
  );
}

async function SummaryCards() {
  const summary = await loadSummary();
  if (!summary || summary.total === 0) {
    return <div className="nb-card p-5 text-sm">필지 수를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</div>;
  }
  const rows = Object.entries(summary.counts).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  return (
    <>
      {/* 황금열쇠 카드 */}
      <div className="nb-card p-4 text-white" style={{ background: "#4da3e8" }}>
        <p className="flex items-center gap-1.5 text-xs">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="15" r="4" />
            <path d="M10.8 12.2 20 3m-3 3 3 3m-6-0 2 2" />
          </svg>
          황금열쇠 카드
        </p>
        <p className="mt-1 text-sm">조사 대상 필지 (서울 {rows.length}개 구)</p>
        <p className="nb-jua mt-0.5 text-4xl leading-tight tabular-nums">{number.format(summary.total)}</p>
        <p className="mt-1 text-sm">조건만 정하면, 후보지를 바로 골라 드려요.</p>
      </div>
      <details className="group nb-card p-4">
        <summary className="nb-jua cursor-pointer list-none text-base marker:hidden">
          구별 필지 수 <span className="font-[family-name:var(--font-body)] text-xs text-[var(--ink-soft)] group-open:hidden">(펼치기)</span>
        </summary>
        <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-auto pr-1">
          {rows.map(([gu, count]) => (
            <li key={gu} className="text-xs">
              <div className="flex justify-between">
                <span>{gu}</span>
                <span className="tabular-nums">{number.format(count)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
                <div className="h-full" style={{ width: `${(count / max) * 100}%`, background: districtColor(gu) }} />
              </div>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6">
      <div className="nb-board flex flex-1 flex-col gap-4 p-3 sm:p-5">
        {/* 게임판 가장자리: 땅 타일 25개 (장식) */}
        <div aria-hidden="true" className="hidden gap-[3px] sm:grid" style={{ gridTemplateColumns: "repeat(25, minmax(0, 1fr))" }}>
          {DISTRICTS.map((gu) => (
            <span key={gu} className="nb-tile" style={{ fontSize: 10 }}>
              <i style={{ background: districtColor(gu), height: 6 }} />
              <span style={{ padding: "4px 0 5px" }}>{shortDistrictName(gu)}</span>
            </span>
          ))}
        </div>

        {/* 머리글 */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* 캠코 로고: 원본(GIF)은 흰 바탕이라 흰 둥근 칸에 넣고, 여백을 잘라 로고만 크게 보이게 한다 */}
            <div className="relative h-14 w-[72px] shrink-0 overflow-hidden rounded-xl border-[2.5px] border-ink bg-white">
              <Image
                src="/kamco-logo.gif"
                alt="캠코 한국자산관리공사 로고"
                width={500}
                height={318}
                unoptimized
                priority
                className="absolute max-w-none"
                style={{ width: 124, height: "auto", left: -28, top: -12 }}
              />
            </div>
            <h1 className="nb-jua text-3xl leading-none text-[var(--orange)] sm:text-4xl" style={{ WebkitTextStroke: "1.2px var(--ink)", paintOrder: "stroke fill" }}>
              나라땅 줍줍단
            </h1>
            {/* 주사위 */}
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" />
              <circle cx="8" cy="8" r="1.2" fill="var(--ink)" />
              <circle cx="12" cy="12" r="1.2" fill="var(--ink)" />
              <circle cx="16" cy="16" r="1.2" fill="var(--ink)" />
              <circle cx="16" cy="8" r="1.2" fill="var(--ink)" />
              <circle cx="8" cy="16" r="1.2" fill="var(--ink)" />
            </svg>
          </div>
          <Suspense fallback={<p className="rounded-full border-[2.5px] border-ink bg-[#ffe08a] px-4 py-1.5 text-xs sm:text-sm">서울 25개 구</p>}>
            <BaseDateChip />
          </Suspense>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[250px_1fr]">
          {/* 왼쪽: 요약 카드와 키우미 */}
          <aside aria-label="데이터 요약" className="flex flex-col gap-3">
            <Suspense fallback={<div className="nb-card h-36 animate-pulse" />}>
              <SummaryCards />
            </Suspense>
            <div className="nb-card flex items-end gap-2 p-3">
              <Image src="/kiumi.png" alt="캠코 캐릭터 키우미" width={899} height={1183} className="h-20 w-auto shrink-0" />
              <div className="relative mb-2 rounded-2xl border-[2.5px] border-ink bg-[#fff9e3] px-2.5 py-2 text-[13px] leading-snug">
                <span className="nb-jua block text-sm">키우미가 도와요</span>
                조건을 정하고 주사위를 굴려요!
              </div>
            </div>
          </aside>

          {/* 오른쪽: 작업 영역 */}
          <main className="flex min-w-0 flex-col gap-4">
            <SelectorApp />
          </main>
        </div>
      </div>
    </div>
  );
}
