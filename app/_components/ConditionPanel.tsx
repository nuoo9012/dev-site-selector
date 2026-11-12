// 조건 영역: 말로 조건을 입력하거나 기본 조건으로 바로 실행한다 (PLAN 작업 10·15)
// Design Ref: §6.1 ① — 입력칸(200자 제한, 남은 글자 수) · 조건 바꾸기 · 기본 조건 요약 · 기본 조건으로 실행
// 디자인: 부루마블 게임판 — 구 선택은 땅 타일, 소유구분은 말(토큰) 모양 버튼, 실행은 "주사위 굴리기" 버튼

import type { RefObject } from "react";
import { DEFAULT_CONDITIONS, DISTRICTS, LAND_SHAPES, OWNER_PRESETS, type OwnerPreset } from "@/lib/conditions";
import { districtColor, shortDistrictName } from "@/lib/district-colors";
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
  /** 기본 조건으로 실행할 때 뺄 땅모양 (비어 있으면 땅모양은 따지지 않음) */
  excludeShapes: string[];
  onExcludeShapesChange: (shapes: string[]) => void;
  /** 면적 범위 입력칸 (빈칸이면 최소는 기본값, 최대는 제한 없음) */
  minAreaText: string;
  maxAreaText: string;
  onMinAreaTextChange: (text: string) => void;
  onMaxAreaTextChange: (text: string) => void;
  /** 면적 칸에 잘못된 값이 있을 때의 안내 */
  areaError: string | null;
  /** "다시 입력"에서 입력칸으로 돌아갈 때 쓴다 */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/** 주사위 그림 (버튼 안) */
function Dice() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function ConditionPanel({ text, onTextChange, onConvert, converting, running, onRunDefault, ownerPreset, onOwnerPresetChange, districts, onDistrictsChange, excludeShapes, onExcludeShapesChange, minAreaText, maxAreaText, onMinAreaTextChange, onMaxAreaTextChange, areaError, textareaRef }: Props) {
  const length = textLength(text.trim());
  const tooLong = length > MAX_TEXT_LENGTH;
  const canConvert = length >= 1 && !tooLong && !converting;

  return (
    <section aria-labelledby="condition-heading" className="nb-card p-4 sm:p-5">
      <h2 id="condition-heading" className="nb-jua text-xl">
        어디를 줍줍할까요?
      </h2>

      {/* ① 말로 입력 */}
      <div className="mt-3">
        <label htmlFor="condition-text" className="text-sm font-bold">
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
          className="nb-input mt-1"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p id="condition-text-help" className="text-xs text-[var(--ink-soft)]">
            면적(예: 1500 이상 3000 이하)·지목·용도지역·소유구분·지역(구)·땅모양 제외(예: 강남구 국유지, 부정형 제외)를 쓸 수 있어요. 말하지 않은 항목은 기본 조건을 써요. 입력한 문장은 조건을 해석하려고 OpenAI로 전송돼요. 개인정보는 적지 마세요.
          </p>
          <p className={`text-xs tabular-nums ${tooLong ? "font-bold text-[var(--coral)]" : "text-[var(--ink-soft)]"}`} aria-live="polite">
            {tooLong ? `${MAX_TEXT_LENGTH}자를 ${length - MAX_TEXT_LENGTH}자 넘었어요` : `${length} / ${MAX_TEXT_LENGTH}자`}
          </p>
        </div>
        <button type="button" onClick={onConvert} disabled={!canConvert} className="nb-btn nb-btn-ghost nb-btn-small nb-jua mt-2">
          {converting ? "바꾸는 중…" : "조건 바꾸기"}
        </button>
      </div>

      {/* ② 기본 조건으로 바로 실행 */}
      <div className="mt-5 border-t-[2.5px] border-dashed border-ink pt-4">
        <p className="nb-jua text-lg">또는 기본 조건으로 바로 실행</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {defaultLines
            .filter(({ key }) => key !== "minArea")
            .map(({ key, label, value }) => (
            <div key={key} className="contents">
              <dt className="text-[var(--ink-soft)]">{label}</dt>
              <dd className="font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        {/* 면적 범위: 최소(기본 1,000㎡)~최대(기본 제한 없음) */}
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">
            면적 범위(㎡) <span className="font-normal text-[var(--ink-soft)]">— 비우면 최소 1,000 이상, 최대 제한 없음</span>
          </legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="min-area">최소 면적(㎡)</label>
            <input id="min-area" type="number" inputMode="decimal" min={0} step="any" value={minAreaText} onChange={(e) => onMinAreaTextChange(e.target.value)} placeholder="최소 (기본 1000)" className="nb-input w-36" aria-invalid={areaError !== null} />
            <span aria-hidden="true">~</span>
            <label className="sr-only" htmlFor="max-area">최대 면적(㎡)</label>
            <input id="max-area" type="number" inputMode="decimal" min={0} step="any" value={maxAreaText} onChange={(e) => onMaxAreaTextChange(e.target.value)} placeholder="최대 (제한 없음)" className="nb-input w-36" aria-invalid={areaError !== null} />
            <span className="text-sm text-[var(--ink-soft)]">㎡ (최소 이상, 최대 이하)</span>
          </div>
          {areaError && (
            <p role="alert" className="nb-alert nb-alert-error mt-2">
              {areaError}
            </p>
          )}
        </fieldset>

        {/* 지역(구): 땅 타일. 여러 개 고를 수 있고, 아무것도 안 고르면 서울 전체 */}
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">
            지역(구) <span className="font-normal text-[var(--ink-soft)]">{districts.length === 0 ? "— 서울 전체" : `— ${districts.length}개 선택`}</span>
          </legend>
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-9 lg:grid-cols-9" role="group" aria-label="지역(구) 선택">
            {DISTRICTS.map((gu) => {
              const selected = districts.includes(gu);
              return (
                <button
                  key={gu}
                  type="button"
                  aria-pressed={selected}
                  aria-label={gu}
                  onClick={() => onDistrictsChange(selected ? districts.filter((d) => d !== gu) : [...districts, gu])}
                  className="nb-tile"
                >
                  <i style={{ background: districtColor(gu) }} />
                  <span>{shortDistrictName(gu)}</span>
                </button>
              );
            })}
          </div>
          {districts.length > 0 && (
            <button type="button" onClick={() => onDistrictsChange([])} className="mt-2 text-xs text-[var(--ink-soft)] underline underline-offset-2 hover:text-[var(--ink)]">
              선택 해제
            </button>
          )}
        </fieldset>

        {/* 소유구분: 말(토큰) 모양 버튼 — 전체 / 국유지 / 공유지 / 국공유지 중 하나 */}
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">누구 땅?</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="소유구분">
            {(Object.keys(OWNER_PRESETS) as OwnerPreset[]).map((name) => (
              <button key={name} type="button" role="radio" aria-checked={name === ownerPreset} onClick={() => onOwnerPresetChange(name)} className="nb-chip">
                {name === "전체" ? "전체(소유구분 안 따짐)" : name}
              </button>
            ))}
          </div>
          {ownerPreset !== "전체" && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">{OWNER_PRESETS[ownerPreset].join("·")} 소유인 필지만 골라요. 소유정보가 없는 필지는 “확인 필요”로 나와요.</p>
          )}
        </fieldset>

        {/* 땅모양 제외: 고른 모양의 땅은 빼고 선별 (모양을 모르는 필지는 "확인 필요"로 나옴) */}
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">
            땅모양 제외 <span className="font-normal text-[var(--ink-soft)]">{excludeShapes.length === 0 ? "— 모양은 따지지 않음" : `— ${excludeShapes.join(", ")} 제외`}</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="제외할 땅모양 선택">
            {LAND_SHAPES.map((shape) => {
              const selected = excludeShapes.includes(shape);
              return (
                <button
                  key={shape}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onExcludeShapesChange(selected ? excludeShapes.filter((x) => x !== shape) : [...excludeShapes, shape])}
                  className="nb-chip nb-chip-toggle"
                >
                  {shape}
                </button>
              );
            })}
          </div>
          {excludeShapes.length > 0 && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]">원본에 땅모양이 비어 있는 필지는 “확인 필요”로 나와요.</p>
          )}
        </fieldset>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onRunDefault} disabled={running} className="nb-btn nb-jua">
            <Dice />
            {running ? "처리 중…" : "주사위 굴리기 · 기본 조건으로 실행"}
          </button>
        </div>
      </div>
    </section>
  );
}
