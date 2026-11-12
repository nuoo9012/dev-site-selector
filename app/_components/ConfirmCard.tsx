// 조건 확인 카드: AI가 바꾼 조건을 보여주고, 담당자가 확인해야만 실행한다 (PLAN 작업 15)
// Design Ref: §6.1 ② — 바뀐 조건 + "기본값" 표시 + [다시 입력] [이 조건으로 실행], 되묻기·지원 안 함 안내
// PRD must ① 규칙 2: 말로 입력한 조건은 실행 전에 화면에 보여주고 담당자 확인을 받는다.
// 디자인: 노란 "찬스 카드"

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
    <section aria-labelledby="confirm-heading" className="nb-card p-4 sm:p-5" style={{ background: "#fff3c4" }}>
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
      <p id="confirm-heading" className="nb-jua text-base">
        AI가 문장을 조건으로 바꾸는 중…
      </p>
    );
  }

  if (parse.status === "error") {
    return (
      <p id="confirm-heading" role="alert" className="nb-alert nb-alert-error">
        {parse.message}
      </p>
    );
  }

  if (parse.status === "notice") {
    const unsupported = parse.kind === "unsupported";
    return (
      <div>
        <h2 id="confirm-heading" className="nb-jua text-xl">
          {unsupported ? "지원하지 않는 조건이 있어요" : "조건을 더 알려 주세요"}
        </h2>
        <p className="nb-alert nb-alert-warn mt-2" style={{ background: "#fff" }}>
          {parse.message}
        </p>
        <p className="mt-2 text-xs text-[var(--ink-soft)]">
          문장을 고쳐서 다시 ‘조건 바꾸기’를 눌러 주세요. 이 안내가 떠 있는 동안에는 선별이 실행되지 않고, 아래 결과도 그대로예요.
        </p>
      </div>
    );
  }

  // 확인을 기다리는 조건
  const { conditions, defaulted } = parse.proposal;
  return (
    <div>
      <h2 id="confirm-heading" className="nb-jua text-xl">
        찬스 카드! 이렇게 바꿨어요. 맞나요?
      </h2>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {describeConditions(conditions).map(({ key, label, value }) => (
          <div key={key} className="contents">
            <dt className="text-[var(--ink-soft)]">{label}</dt>
            <dd className="font-bold">
              {value}
              {defaulted.includes(key) && (
                <span className="ml-2 rounded-full border-2 border-ink bg-[#ffd54f] px-2 py-0.5 text-xs font-bold">기본값</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {defaulted.length > 0 && <p className="mt-2 text-xs text-[var(--ink-soft)]">‘기본값’은 문장에 없어서 기본 조건을 쓴 항목이에요.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onConfirm} disabled={running} className="nb-btn nb-jua">
          {running ? "처리 중…" : "이 조건으로 실행"}
        </button>
        <button type="button" onClick={onRetype} className="nb-btn nb-btn-ghost nb-jua">
          다시 입력
        </button>
      </div>
    </div>
  );
}
