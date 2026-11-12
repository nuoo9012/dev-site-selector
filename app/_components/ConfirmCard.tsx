// 조건 확인 카드: AI가 바꾼 조건을 보여주고, 담당자가 확인해야만 실행한다 (PLAN 작업 15)
// Design Ref: §6.1 ② — 바뀐 조건 + "기본값" 표시 + [다시 입력] [이 조건으로 실행], 되묻기·지원 안 함 안내
// PRD must ① 규칙 2: 말로 입력한 조건은 실행 전에 화면에 보여주고 담당자 확인을 받는다.

import { describeConditions } from "@/lib/format";
import type { ParseState } from "./SelectorApp";

interface Props {
  parse: ParseState;
  /** 서버에서 선별 계산 중인지 (실행 버튼을 잠근다) */
  running: boolean;
  onConfirm: () => void;
  onRetype: () => void;
}

export function ConfirmCard({ parse, running, onConfirm, onRetype }: Props) {
  if (parse.status === "idle") return null;

  return (
    <section
      aria-labelledby="confirm-heading"
      className="rounded-3xl border border-orange-400/30 bg-orange-500/10 p-5 sm:p-6"
    >
      {/* 상태가 바뀔 때 화면 읽기 프로그램이 알려 주도록 aria-live를 둔다 */}
      <div aria-live="polite">
        <Body parse={parse} running={running} onConfirm={onConfirm} onRetype={onRetype} />
      </div>
    </section>
  );
}

function Body({ parse, running, onConfirm, onRetype }: Props) {
  if (parse.status === "idle") return null; // 위에서 이미 걸러지지만, 아래 코드가 확인 단계만 다루도록 타입을 좁힌다
  if (parse.status === "loading") {
    return (
      <p id="confirm-heading" className="text-sm text-zinc-700 dark:text-zinc-300">
        AI가 문장을 조건으로 바꾸는 중…
      </p>
    );
  }

  if (parse.status === "error") {
    return (
      <p id="confirm-heading" role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        {parse.message}
      </p>
    );
  }

  if (parse.status === "notice") {
    const unsupported = parse.kind === "unsupported";
    return (
      <div>
        <h2 id="confirm-heading" className="text-base font-semibold">
          {unsupported ? "지원하지 않는 조건이 있어요" : "조건을 더 알려 주세요"}
        </h2>
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{parse.message}</p>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          문장을 고쳐서 다시 ‘조건 바꾸기’를 눌러 주세요. 이 안내가 떠 있는 동안에는 선별이 실행되지 않고, 아래 결과도 그대로예요.
        </p>
      </div>
    );
  }

  // 확인을 기다리는 조건
  const { conditions, defaulted } = parse.proposal;
  return (
    <div>
      <h2 id="confirm-heading" className="text-base font-semibold">
        이렇게 바꿨어요. 맞나요?
      </h2>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {describeConditions(conditions).map(({ key, label, value }) => (
          <div key={key} className="contents">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd>
              {value}
              {defaulted.includes(key) && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                  기본값
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {defaulted.length > 0 && (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">‘기본값’은 문장에 없어서 기본 조건을 쓴 항목이에요.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={running}
          className="inline-flex h-10 items-center justify-center rounded-full bg-orange-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {running ? "처리 중…" : "이 조건으로 실행"}
        </button>
        <button
          type="button"
          onClick={onRetype}
          className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-transparent px-6 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 "
        >
          다시 입력
        </button>
      </div>
    </div>
  );
}
