"use client";

// 화면 전체의 상태(문장 입력 → 조건 변환 → 확인 → 실행 → 결과 → 엑셀 내려받기)를 관리하는 부품 (PLAN 작업 10·12·15)
// Design Ref: §3.3, §6.3 — AI가 바꾼 조건은 담당자가 확인 카드에서 "이 조건으로 실행"을 눌러야만 선별이 실행된다.

import { useRef, useState } from "react";
import { DEFAULT_CONDITIONS, OWNER_PRESETS, type OwnerPreset } from "@/lib/conditions";
import { textLength } from "@/lib/format";
import { MAX_TEXT_LENGTH, type ApiError, type Conditions, type ParseConditionResponse, type SelectResponse } from "@/lib/types";
import { ConditionPanel } from "./ConditionPanel";
import { ConfirmCard } from "./ConfirmCard";
import { ResultTable } from "./ResultTable";

export type RunState =
  | { status: "idle" } // 아직 실행 전
  | { status: "loading" } // 서버에서 계산 중
  | { status: "error"; message: string }
  | { status: "done"; result: SelectResponse };

export type DownloadState =
  | { status: "idle" }
  | { status: "loading" } // 엑셀을 만드는 중
  | { status: "error"; message: string };

/** 문장 → 조건 변환 단계의 상태 */
export type ParseState =
  | { status: "idle" }
  | { status: "loading" } // AI가 문장을 읽는 중
  | { status: "proposal"; proposal: Extract<ParseConditionResponse, { status: "ok" }> } // 확인을 기다리는 조건
  | { status: "notice"; kind: "need_clarification" | "unsupported"; message: string } // 되묻기·지원 안 함 안내
  | { status: "error"; message: string };

const FALLBACK_FILE_NAME = "개발대상지.xlsx";

// 응답 머리글(Content-Disposition)에서 한글 파일 이름을 꺼낸다
function fileNameFrom(response: Response): string {
  const header = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      // 이름을 읽지 못하면 아래 기본 이름을 쓴다
    }
  }
  return FALLBACK_FILE_NAME;
}

// 서버가 보낸 오류 안내가 있으면 그 문장을, 없으면 기본 문장을 쓴다
async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return (body as ApiError | null)?.error?.message ?? fallback;
}

const CONNECTION_ERROR = "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

export function SelectorApp() {
  const [text, setText] = useState("");
  // 기본 조건으로 실행할 때 적용할 소유구분 묶음 (전체 / 국유지 / 공유지 / 국공유지)
  const [ownerPreset, setOwnerPreset] = useState<OwnerPreset>("전체");
  // 기본 조건으로 실행할 때 적용할 구 (비어 있으면 서울 전체)
  const [districts, setDistricts] = useState<string[]>([]);
  // 기본 조건으로 실행할 때 뺄 땅모양 (비어 있으면 땅모양은 따지지 않음)
  const [excludeShapes, setExcludeShapes] = useState<string[]>([]);
  const [parse, setParse] = useState<ParseState>({ status: "idle" });
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 변환 요청의 번호. 응답을 기다리는 동안 문장을 고치면 번호가 바뀌어, 늦게 온 옛 응답은 버린다.
  const parseSeq = useRef(0);
  // "지금 요청 중"인지 따로 기억한다. 화면 갱신을 기다리지 않고 바로 확인할 수 있어서,
  // 같은 순간에 버튼이 두 번 눌려도 요청(특히 비용이 드는 AI 호출)이 한 번만 나간다.
  const converting = useRef(false);
  const selecting = useRef(false);
  const downloading = useRef(false);

  // 진행 중인 변환을 취소하고 확인 카드·안내를 지운다. (응답이 나중에 와도 번호가 달라 버려진다)
  function resetParse() {
    parseSeq.current += 1;
    converting.current = false;
    setParse({ status: "idle" });
  }

  // 문장을 고치면 이전 변환 결과(확인 카드·안내)는 더 이상 이 문장의 것이 아니므로 지운다
  function changeText(next: string) {
    setText(next);
    resetParse();
  }

  // 말로 입력한 문장을 AI로 조건으로 바꾼다. 선별은 실행하지 않는다 (확인 뒤에만 실행).
  async function convertText() {
    const sentence = text.trim();
    if (converting.current || textLength(sentence) < 1 || textLength(sentence) > MAX_TEXT_LENGTH) return;
    converting.current = true;
    const seq = ++parseSeq.current;
    setParse({ status: "loading" });
    try {
      const response = await fetch("/api/parse-condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      });
      if (seq !== parseSeq.current) return; // 그사이 문장이 바뀌었다
      if (!response.ok) {
        const message = await errorMessage(response, "조건으로 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        if (seq === parseSeq.current) setParse({ status: "error", message });
        return;
      }
      const body = (await response.json()) as ParseConditionResponse;
      if (seq !== parseSeq.current) return;
      setParse(
        body.status === "ok"
          ? { status: "proposal", proposal: body }
          : { status: "notice", kind: body.status, message: body.message },
      );
    } catch {
      if (seq === parseSeq.current) setParse({ status: "error", message: CONNECTION_ERROR });
    } finally {
      // 취소(문장 수정 등)된 요청은 이미 상태가 정리됐으니, 지금 요청이 최신일 때만 "진행 중" 표시를 푼다
      if (seq === parseSeq.current) converting.current = false;
    }
  }

  // 정해진 조건으로 선별 API를 호출한다. 계산 중에는 다시 누를 수 없다.
  async function runSelection(conditions: Conditions) {
    if (selecting.current) return;
    selecting.current = true;
    setState({ status: "loading" });
    setDownload({ status: "idle" }); // 새 결과가 나오기 전의 내려받기 오류는 지운다
    try {
      const response = await fetch("/api/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conditions),
      });
      if (!response.ok) {
        setState({ status: "error", message: await errorMessage(response, "결과를 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.") });
        return;
      }
      setState({ status: "done", result: (await response.json()) as SelectResponse });
    } catch {
      setState({ status: "error", message: CONNECTION_ERROR });
    } finally {
      selecting.current = false;
    }
  }

  // 기본 조건으로 바로 실행. 이전 변환 결과는 지운다.
  function runDefault() {
    resetParse();
    const owners = [...OWNER_PRESETS[ownerPreset]];
    // 소유구분·지역을 고르지 않았으면(전체) 이전과 같은 모양으로 보낸다
    void runSelection({
      ...DEFAULT_CONDITIONS,
      ...(owners.length > 0 ? { owners } : {}),
      ...(districts.length > 0 ? { districts } : {}),
      ...(excludeShapes.length > 0 ? { excludeShapes } : {}),
    });
  }

  // 확인 카드의 "이 조건으로 실행" — 담당자가 확인한 조건만 실행한다. 실행하면 카드는 닫는다.
  function confirmProposal() {
    if (parse.status !== "proposal" || selecting.current) return;
    const { conditions } = parse.proposal;
    resetParse();
    void runSelection(conditions);
  }

  // 확인 카드의 "다시 입력" — 카드를 닫고 입력칸으로 돌아간다
  function retype() {
    setParse({ status: "idle" });
    textareaRef.current?.focus();
  }

  // 지금 적용된 조건으로 엑셀을 받는다. 결과가 아니라 조건을 보내고, 서버가 같은 조건으로 다시 계산한다.
  async function downloadExcel(conditions: Conditions) {
    if (downloading.current) return;
    downloading.current = true;
    setDownload({ status: "loading" });
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conditions),
      });
      if (!response.ok) {
        setDownload({ status: "error", message: await errorMessage(response, "엑셀을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.") });
        return;
      }
      // 받은 파일을 브라우저 저장 기능으로 넘긴다
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDownload({ status: "idle" });
    } catch {
      setDownload({ status: "error", message: CONNECTION_ERROR });
    } finally {
      downloading.current = false;
    }
  }

  return (
    <>
      <ConditionPanel
        text={text}
        onTextChange={changeText}
        onConvert={convertText}
        converting={parse.status === "loading"}
        running={state.status === "loading"}
        onRunDefault={runDefault}
        ownerPreset={ownerPreset}
        onOwnerPresetChange={setOwnerPreset}
        districts={districts}
        onDistrictsChange={setDistricts}
        excludeShapes={excludeShapes}
        onExcludeShapesChange={setExcludeShapes}
        textareaRef={textareaRef}
      />
      <ConfirmCard
        parse={parse}
        running={state.status === "loading"}
        onConfirm={confirmProposal}
        onRetype={retype}
      />
      <ResultTable state={state} download={download} onDownload={downloadExcel} />
    </>
  );
}
