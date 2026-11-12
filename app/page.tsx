// 선별기 화면 (PLAN 작업 10)
// Design Ref: §6.1 — 머리글(제목·대상 지자체·데이터 기준일) + 조건 영역 + 결과 표
// 서울 확장: 필지는 데이터베이스에 있고, 화면에는 기준일·필지 수 요약만 서버에서 읽어 보여준다.
// 디자인: 짙은 바탕, 둥근 알약 머리글, 왼쪽 숫자 카드(요약) + 오른쪽 작업 영역

import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
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
    <p className="rounded-full bg-white/[0.06] px-4 py-1.5 text-xs text-zinc-300 sm:text-sm">
      서울 25개 구 · {summary ? formatBaseDates(summary.baseDates) : "데이터 기준일을 불러오지 못했어요"}
    </p>
  );
}

async function SummaryCards() {
  const summary = await loadSummary();
  if (!summary || summary.total === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-sm text-zinc-300">
        필지 수를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.
      </div>
    );
  }
  const rows = Object.entries(summary.counts).sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1;
  return (
    <>
      {/* 배경: 귀여운 서울 부루마블 그림. 글씨가 잘 읽히도록 어두운 막을 한 겹 덮는다 */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10">
        <Image src="/seoul-board.webp" alt="" fill sizes="320px" className="object-cover" aria-hidden="true" />
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundColor: "rgb(0 0 0 / 0.66)" }} />
        {/* 글씨는 그림과 어두운 막 위에 보이도록 맨 뒤에 둔다(나중에 그려지는 것이 위에 보임) */}
        <div className="relative p-6">
          <p className="text-sm text-zinc-200">조사 대상 필지 (서울 {rows.length}개 구)</p>
          <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums drop-shadow-[0_2px_6px_rgb(0_0_0/0.6)]">{number.format(summary.total)}</p>
          <p className="mt-3 text-sm text-zinc-100">조건만 정하면, 후보지를 바로 골라 드려요.</p>
        </div>
      </div>
      <details className="group rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-200 marker:hidden">
          구별 필지 수 <span className="text-zinc-400 group-open:hidden">(펼치기)</span>
        </summary>
        <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-auto pr-1">
          {rows.map(([gu, count]) => (
            <li key={gu} className="text-xs">
              <div className="flex justify-between text-zinc-300">
                <span>{gu}</span>
                <span className="tabular-nums">{number.format(count)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(count / max) * 100}%` }} />
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
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
      {/* 머리글: 알약 모양 */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {/* 캠코 로고: 원본(GIF)은 흰 바탕이라 흰 둥근 칸에 넣고, 여백을 잘라 로고만 크게 보이게 한다 */}
          <div className="relative h-16 w-[80px] shrink-0 overflow-hidden rounded-2xl bg-white">
            <Image
              src="/kamco-logo.gif"
              alt="캠코 한국자산관리공사 로고"
              width={500}
              height={318}
              unoptimized
              priority
              className="absolute max-w-none"
              style={{ width: 138, height: "auto", left: -32, top: -13 }}
            />
          </div>
          <h1 className="font-[family-name:var(--font-title)] text-2xl tracking-wide">나라땅 줍줍단</h1>
        </div>
        <Suspense fallback={<p className="rounded-full bg-white/[0.06] px-4 py-1.5 text-xs text-zinc-400 sm:text-sm">서울 25개 구</p>}>
          <BaseDateChip />
        </Suspense>
      </header>

      <div className="grid flex-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* 왼쪽: 요약 숫자 카드 */}
        <aside aria-label="데이터 요약" className="flex flex-col gap-4">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" />}>
            <SummaryCards />
          </Suspense>
          {/* 키우미: 왼쪽 아래 안내 카드 */}
          <div className="relative min-h-36 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/20 to-white/[0.03] p-5 pr-32 backdrop-blur-sm">
            <p className="text-sm font-semibold">키우미가 도와드려요</p>
            <p className="mt-1 text-sm text-zinc-300">조건을 정하고 ‘실행’을 눌러 보세요.</p>
            <Image
              src="/kiumi.png"
              alt="캠코 캐릭터 키우미"
              width={899}
              height={1183}
              className="absolute -bottom-3 right-3 h-36 w-auto drop-shadow-[0_6px_14px_rgb(0_0_0/0.45)]"
            />
          </div>
        </aside>

        {/* 오른쪽: 작업 영역 */}
        <main className="flex min-w-0 flex-col gap-5">
          <SelectorApp />
        </main>
      </div>
    </div>
  );
}
