// 조건 영역: 말로 조건을 입력하거나 기본 조건으로 바로 실행한다 (PLAN 작업 10·15)
// Design Ref: §6.1 ① — 입력칸(200자 제한, 남은 글자 수) · 조건 바꾸기 · 기본 조건 요약 · 기본 조건으로 실행

import type { RefObject } from "react";
import { DEFAULT_CONDITIONS, DISTRICTS, OWNER_PRESETS, type OwnerPreset } from "@/lib/conditions";
import { describeConditions, textLength } from "@/lib/format";
import { MAX_TEXT_LENGTH } from "@/lib/types";

const defaultLines = describeConditions(DEFAULT_CONDITIONS);

interface Props {
  /** 입력칸의 문장 */
  text: string;
  onTextChange: (text: string) => void;
  /** "조건 바꾸기" — 문장을 AI로 조건으로 바꾼다 */
  onConvert: () => void;
  /** AI가 문장을 읽는 중인지 */
  converting: boolean;
  /** 서버에서 선별 계산 중인지 */
  running: boolean;
  onRunDefault: () => void;
  /** 기본 조건으로 실행할 때 쓸 소유구분 묶음 */
  ownerPreset: OwnerPreset;
  onOwnerPresetChange: (preset: OwnerPreset) => void;
  /** 기본 조건으로 실행할 때 쓸 구 (비어 있으면 서울 전체) */
  districts: string[];
  onDistrictsChange: (districts: string[]) => void;
  /** "다시 입력"에서 입력칸으로 돌아갈 때 쓴다 */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function ConditionPanel({ text, onTextChange, onConvert, converting, running, onRunDefault, ownerPreset, onOwnerPresetChange, districts, onDistrictsChange, textareaRef }: Props) {
  const length = textLength(text.trim());
  const tooLong = length > MAX_TEXT_LENGTH;
  const canConvert = length >= 1 && !tooLong && !converting;

  return (
    <section
      aria-labelledby="condition-heading"
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-6"
    >
      <h2 id="condition-heading" className="text-base font-semibold">
        선별 조건
      </h2>

      {/* ① 말로 입력 */}
      <div className="mt-3">
        <label htmlFor="condition-text" className="text-sm font-medium">
          조건을 말로 입력해 보세요
        </label>
        <textarea
          id="condition-text"
          ref={textareaRef}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl(또는 ⌘) + Enter로도 바꿀 수 있다
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canConvert) onConvert();
          }}
          rows={2}
          placeholder="예) 면적 2천㎡ 이상 준주거만"
          aria-describedby="condition-text-help"
          aria-invalid={tooLong}
          className="mt-1 w-full resize-y rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm placeholder:text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-orange-400 aria-[invalid=true]:border-red-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p id="condition-text-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            면적·지목·용도지역·소유구분·지역(구)(예: 강남구 국유지만)을 쓸 수 있어요. 말하지 않은 항목은 기본 조건을 써요. 입력한 문장은 조건을 해석하려고 OpenAI로 전송돼요. 개인정보는 적지 마세요.
          </p>
          <p
            className={`text-xs tabular-nums ${tooLong ? "font-semibold text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
            aria-live="polite"
          >
            {tooLong ? `${MAX_TEXT_LENGTH}자를 ${length - MAX_TEXT_LENGTH}자 넘었어요` : `${length} / ${MAX_TEXT_LENGTH}자`}
          </p>
        </div>
        <button
          type="button"
          onClick={onConvert}
          disabled={!canConvert}
          className="mt-2 inline-flex h-10 items-center justify-center rounded-full border border-orange-400 bg-transparent px-6 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:text-zinc-400 disabled:border-zinc-700 disabled:text-zinc-600"
        >
          {converting ? "바꾸는 중…" : "조건 바꾸기"}
        </button>
      </div>

      {/* ② 기본 조건으로 바로 실행 */}
      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm font-medium">또는 기본 조건으로 바로 실행</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {defaultLines.map(({ key, label, value }) => (
            <div key={key} className="contents">
              <dt className="font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {/* 지역(구): 여러 개 고를 수 있고, 아무것도 안 고르면 서울 전체 (기본 조건 실행에 적용) */}
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">
            지역(구) <span className="font-normal text-zinc-400">{districts.length === 0 ? "— 서울 전체" : `— ${districts.length}개 선택`}</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="지역(구) 선택">
            {DISTRICTS.map((gu) => {
              const selected = districts.includes(gu);
              return (
                <button
                  key={gu}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onDistrictsChange(selected ? districts.filter((d) => d !== gu) : [...districts, gu])}
                  className={`inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
                    selected ? "border-orange-400 bg-orange-500/20 font-semibold text-orange-200" : "border-white/20 bg-transparent text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  {gu}
                </button>
              );
            })}
            {districts.length > 0 && (
              <button
                type="button"
                onClick={() => onDistrictsChange([])}
                className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
              >
                선택 해제
              </button>
            )}
          </div>
        </fieldset>
        {/* 소유구분: 전체 / 국유지 / 공유지 / 국공유지 중 하나 (기본 조건 실행에 적용) */}
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">소유구분</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="소유구분">
            {(Object.keys(OWNER_PRESETS) as OwnerPreset[]).map((name) => {
              const selected = name === ownerPreset;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onOwnerPresetChange(name)}
                  className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${
                    selected ? "border-orange-400 bg-orange-500/20 font-semibold text-orange-200" : "border-white/20 bg-transparent text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  {name === "전체" ? "전체(소유구분 안 따짐)" : name}
                </button>
              );
            })}
          </div>
          {ownerPreset !== "전체" && (
            <p className="mt-2 text-xs text-zinc-400">{OWNER_PRESETS[ownerPreset].join("·")} 소유인 필지만 골라요. 소유정보가 없는 필지는 “확인 필요”로 나와요.</p>
          )}
        </fieldset>
        <button
          type="button"
          onClick={onRunDefault}
          disabled={running}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-orange-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {running ? "처리 중…" : "기본 조건으로 실행"}
        </button>
      </div>
    </section>
  );
}
