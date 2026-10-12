/*
 * DocFlow — HTML5/CSS3/Vanilla JS mock RAG dashboard
 * Architecture: Store → DocumentService / Retriever → Fetch Adapter → Views → Controller
 * Security: local documents never leave the browser in DEMO_MODE.
 * WARNING: PDF source text is NOT parsed; PDF cards are metadata-only simulations.
 */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    DEMO_MODE: true,                   // false + real backend endpoint for production
    API_ENDPOINT: "/api/rag-query",  // POST, application/x-ndjson streaming response
    CHUNK_SIZE: 500,
    CHUNK_OVERLAP: 60,
    MAX_FILES: 8,
    MAX_TEXT_BYTES: 2 * 1024 * 1024,
    MAX_PDF_BYTES: 2 * 1024 * 1024,
    FIRST_CHUNKS_SHOWN: 4,
    MOCK_INTERVAL_MS: 28
  });

  const $ = (selector) => document.querySelector(selector);
  const formatNumber = (number) => new Intl.NumberFormat("ko-KR").format(number);
  const newId = () => (typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const shorten = (text, max = 160) => {
    const oneLine = String(text).replace(/\s+/g, " ").trim();
    return Array.from(oneLine).length > max
      ? Array.from(oneLine).slice(0, max).join("") + "…"
      : oneLine;
  };
  const h = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // NEVER use innerHTML for uploaded data
    return node;
  };

  const SAMPLE_TEXT = `# 2026년 하반기 사내 공지사항 모음

## 인사팀 - 재택근무 및 유연근무 제도
재택근무 신청 방법: 직원은 사내 인사 포털에서 재택근무 신청서를 작성하고 소속 팀장의 승인을 받아야 합니다. 신청은 재택근무 예정일 기준 최소 2영업일 전까지 제출해야 합니다. 긴급한 사유가 있는 경우 팀장과 사전 협의 후 예외적으로 신청할 수 있습니다.
재택근무 가능 일수: 원칙적으로 주 2일까지 허용하며, 직무 특성 및 팀 운영 일정에 따라 조정할 수 있습니다. 출근 및 퇴근 시각은 포털에 기록해야 하며, 업무 수행 중에는 사내 메신저의 업무 상태를 활성화해야 합니다.
협업 및 보안: 사내 자료를 개인 이메일로 전송해서는 안 됩니다. 회사에서 승인한 기기와 VPN을 사용해야 하며, 공용 와이파이를 이용할 때는 반드시 회사 VPN을 연결해야 합니다. 고객정보와 인사자료는 사전 승인 없이 외부 저장 장치에 복사할 수 없습니다.
연차 휴가 신청: 연차 신청은 인사 포털에서 최소 3영업일 전에 제출하며, 팀장의 승인 후 확정됩니다. 연차 발생 및 잔여 일수는 인사 포털의 개인 근태 메뉴에서 확인할 수 있습니다.

## 정보보안팀 - 계정 및 비밀번호 관리
비밀번호 변경 주기: 업무 시스템 비밀번호는 최소 12자 이상의 복잡한 문자열을 사용하고, 의심스러운 로그인이나 유출 정황이 확인되면 즉시 변경해야 합니다. 정기적인 일괄 변경보다 다중 인증과 유출 대응을 우선합니다.
다중 인증: 사내 주요 업무 시스템 접속 시 MFA를 필수 적용합니다. 인증 수단 분실 시에는 정보보안팀 헬프데스크에 즉시 신고해야 합니다.
사고 신고: 피싱 메일 또는 악성코드 감염이 의심되면 첨부파일을 실행하지 말고 정보보안팀에 즉시 신고해야 합니다. 임의로 증거를 삭제하거나 시스템을 초기화하지 않습니다.

## 교육지원팀 - 직무 교육 및 교육비 지원
교육비 지원 기준: 업무 관련성이 인정되는 외부 교육 과정은 연간 최대 60만원까지 회사 지원을 받을 수 있습니다. 교육 시작 전 팀장 승인 및 교육지원팀의 예산 확인이 필요합니다.
신청 절차: 신청자는 교육 신청서, 교육과정 소개자료, 예상 비용을 교육 시작 7일 전까지 제출합니다. 교육 수료 후에는 14일 이내에 수료증 및 영수증을 등록해야 합니다.
지원 제외 항목: 업무 관련성이 없는 취미 과정, 사전 승인을 받지 않은 결제 금액, 증빙이 없는 금액은 원칙적으로 지원하지 않습니다.

## 총무팀 - 회의실 및 공용 자산 관리
회의실 예약: 회의실은 사내 그룹웨어에서 예약하며, 회의 종료 즉시 예약을 종료하고 실내 장비와 조명을 확인해야 합니다. 외부 방문자가 참석하는 회의는 방문자 등록 절차를 따릅니다.
공용 장비 대여: 노트북과 프로젝터 등 공용 장비는 총무팀의 대여 관리 시스템에서 신청하며, 반납 기한을 초과하는 경우 담당자에게 사전에 연장 요청을 해야 합니다.`;

  // ─────────────────────────── State layer ───────────────────────────────
  class AppStore {
    constructor() {
      this.state = { documents: [], activeDocumentId: "all", messages: [], busy: false, theme: "light" };
      this.listeners = new Set();
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    update(patch, change) {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener(this.state, change);
    }
    get searchableChunks() {
      return this.state.documents.filter((d) => d.searchable).flatMap((d) => d.chunks);
    }
  }

  // ─────────────────────────── Document layer ────────────────────────────
  class DocumentService {
    // Read exact bytes first. readAsText(file, "UTF-8") silently corrupts Korean
    // ANSI (CP949) files, which looks like successful upload but breaks retrieval.
    static readFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("파일을 읽을 수 없습니다."));
        reader.onabort = () => reject(new DOMException("읽기가 취소되었습니다.", "AbortError"));
        reader.readAsArrayBuffer(file);
      });
    }

    static decodeText(data, preference = "auto") {
      if (!(data instanceof ArrayBuffer) || !data.byteLength) {
        throw new Error("빈 파일이거나 읽을 수 없는 텍스트 파일입니다.");
      }
      const bytes = new Uint8Array(data);
      const candidates = [];
      if (preference !== "auto") {
        candidates.push(preference);
      } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        candidates.push("utf-8");
      } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        candidates.push("utf-16le");
      } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        candidates.push("utf-16be");
      } else {
        // A high proportion of NULs on alternating byte positions often
        // indicates BOM-less UTF-16. Only examine a small prefix.
        const sampleSize = Math.min(bytes.length - (bytes.length % 2), 512);
        let evenNulls = 0;
        let oddNulls = 0;
        for (let i = 0; i < sampleSize; i += 2) {
          if (bytes[i] === 0) evenNulls++;
          if (bytes[i + 1] === 0) oddNulls++;
        }
        const pairs = sampleSize / 2;
        if (pairs >= 4 && oddNulls / pairs > .25 && evenNulls / pairs < .07) {
          candidates.push("utf-16le");
        } else if (pairs >= 4 && evenNulls / pairs > .25 && oddNulls / pairs < .07) {
          candidates.push("utf-16be");
        }
        candidates.push("utf-8", "euc-kr"); // euc-kr label covers Windows CP949 in Chrome
      }

      for (const encoding of [...new Set(candidates)]) {
        try {
          const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
          const text = decoded.replace(/^\uFEFF/, "");
          const controls = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
          if (controls / Math.max(text.length, 1) > .01) continue;
          if (!text.trim()) throw new Error("텍스트 내용이 비어 있습니다.");
          const label = encoding === "euc-kr" ? "CP949 / EUC-KR" : encoding.toUpperCase();
          return { text, encoding: label };
        } catch (error) {
          if (error.message === "텍스트 내용이 비어 있습니다.") throw error;
          // Try next encoding only in auto mode.
        }
      }
      throw new Error("문자 인코딩을 판독할 수 없습니다. 인코딩을 UTF-8, CP949, UTF-16으로 직접 선택해 다시 업로드하세요.");
    }

    static normalizeText(text) {
      return String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
    }

    static isHeading(line) {
      const s = line.trim();
      if (s.length > 100) return false;
      return /^(#{1,4}\s+\S|제\s*\d+\s*[장절조]\s*\S|\[[^\]]{2,}\]|\d+(?:\.\d+)*[.)]\s+\S)/.test(s);
    }

    static extractSections(source) {
      const lines = source.split("\n");
      const sections = [];
      let title = "본문";
      let body = [];
      const flush = () => {
        const text = body.join("\n").trim();
        if (text) sections.push({ id: newId(), title, text, chunks: [] });
      };
      for (const line of lines) {
        if (this.isHeading(line)) {
          flush();
          title = line.replace(/^#{1,4}\s+/, "").trim();
          body = [];
        } else {
          body.push(line);
        }
      }
      flush();
      if (!sections.length && source.trim()) {
        sections.push({ id: newId(), title: "본문", text: source.trim(), chunks: [] });
      }
      return sections;
    }

    static chunkText(text) {
      // Array.from counts Unicode code points, not UTF-16 code units.
      const chars = Array.from(text);
      const output = [];
      let start = 0;
      while (start < chars.length) {
        let end = Math.min(start + CONFIG.CHUNK_SIZE, chars.length);
        if (end < chars.length) {
          const floor = start + Math.floor(CONFIG.CHUNK_SIZE * .75);
          for (let i = end - 1; i >= floor; i--) {
            if (/[\n.!?。\s]/u.test(chars[i])) {
              end = i + 1;
              break;
            }
          }
        }
        const slice = chars.slice(start, end).join("").trim();
        if (slice) output.push(slice);
        if (end >= chars.length) break;
        start = Math.max(start + 1, end - CONFIG.CHUNK_OVERLAP);
      }
      return output;
    }

    static buildTextDocument(name, sourceText, bytes = 0, encoding = "UTF-8", kind = "txt") {
      const normalized = this.normalizeText(sourceText);
      if (!normalized) throw new Error(`${name}: 텍스트가 비어 있습니다.`);
      const docId = newId();
      const sections = this.extractSections(normalized);
      const chunks = [];
      for (const section of sections) {
        for (const chunkText of this.chunkText(section.text)) {
          const chunk = {
            id: newId(), documentId: docId, documentName: name,
            sectionId: section.id, sectionTitle: section.title,
            order: chunks.length + 1, text: chunkText, simulated: false
          };
          section.chunks.push(chunk);
          chunks.push(chunk);
        }
      }
      return { id: docId, name, bytes, kind, encoding, searchable: true,
        sections, chunks, characters: Array.from(normalized).length };
    }

    static buildPdfDemoDocument(file, data) {
      // PDF binary bytes are read by FileReader but not text-extracted.
      // These synthetic chunks describe the simulation ONLY; never index them for retrieval.
      if (!(data instanceof ArrayBuffer)) throw new Error("PDF 파일 읽기에 실패했습니다.");
      const signature = new TextDecoder("ascii").decode(data.slice(0, 5));
      if (signature !== "%PDF-") {
        throw new Error(`${file.name}: 정상적인 PDF 파일 헤더를 찾을 수 없습니다.`);
      }
      const docId = newId();
      const sectionId = newId();
      const simulatedText = `PDF 구조 시뮬레이션: ${file.name} (${formatNumber(file.size)} bytes). ` +
        "이 예제는 PDF 메타데이터 확인과 청크 화면 표시만 제공합니다. " +
        "PDF의 실제 본문과 목차는 추출하지 않았으며 질의응답 검색 대상에서 제외됩니다.";
      const chunk = { id: newId(), documentId: docId, documentName: file.name,
        sectionId, sectionTitle: "PDF 데모 구조 (본문 미추출)",
        order: 1, text: simulatedText, simulated: true };
      return { id: docId, name: file.name, bytes: file.size, kind: "pdf",
        searchable: false, sections: [{ id: sectionId, title: "PDF 데모 구조 (본문 미추출)", text: simulatedText, chunks: [chunk] }],
        chunks: [chunk], characters: 0 };
    }
  }

  // ─────────────────────────── Retrieval layer ───────────────────────────
  class LocalRetriever {
    static stopWords = new Set([
      "무엇", "무엇인가요", "알려줘", "알려", "어떻게", "어떤", "대해서", "설명",
      "해주세요", "해줘", "있나요", "있는지", "하는", "관련", "정리", "요약",
      "요점", "핵심", "주요", "내용", "전체", "개요", "문서", "파일", "텍스트",
      "대해", "보여줘", "뭔가요", "뭔지", "뭐야", "이것", "그것", "해줄래",
      "주세요", "해주고", "분석", "그리고", "어떤가요", "이거", "그냥", "좀",
      "간단히", "간략히", "한번", "읽어줘", "문제", "질문", "어느", "뭔데",
      "what", "about", "please", "tell", "summary", "summarize", "document", "file", "this"
    ]);
    static overviewRegex = /(요약|요점|핵심|개요|전체\s*내용|주요\s*내용|어떤\s*내용|무슨\s*내용|무엇을\s*다루|읽어줘|summari[sz]e|overview|summary)/iu;

    static tokens(question) {
      return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])
        .map((token) => token.replace(/(해주세요|해줘요|해줘|인가요|하나요|습니까|합니다|있나요|되는지|해지는|에서|에게|으로|부터|까지|하고|이나|거나|들은|들의|은|는|이|가|을|를|와|과|의|에|도|만|요)$/u, ""))
        .filter((token) => token.length >= 2 && !this.stopWords.has(token)))];
    }

    static compact(value) {
      return String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    }

    static isOverview(question, words) {
      return this.overviewRegex.test(question) && words.length === 0;
    }

    static overviewChunks(documents, limit) {
      const chosen = [];
      const seen = new Set();
      // First cover different sections, then fill remaining slots with later chunks.
      const candidates = [
        ...documents.flatMap((d) => d.sections.map((s) => s.chunks[0]).filter(Boolean)),
        ...documents.flatMap((d) => d.chunks)
      ];
      for (const chunk of candidates) {
        if (seen.has(chunk.id)) continue;
        chosen.push(chunk);
        seen.add(chunk.id);
        if (chosen.length >= limit) break;
      }
      return chosen;
    }

    static retrieve(question, documents, limit = 4) {
      const searchable = documents.filter((d) => d.searchable && d.chunks.length);
      const base = { documents: searchable.map((d) => d.name), context: [], words: [] };
      if (!searchable.length) return { ...base, mode: "empty" };

      const words = this.tokens(question);
      if (this.isOverview(question, words)) {
        return { ...base, mode: "overview", context: this.overviewChunks(searchable, limit) };
      }
      if (!words.length) {
        return { ...base, mode: "needs-keyword" };
      }
      const queryPhrase = this.compact(question);
      const scored = searchable.flatMap((doc) => doc.chunks.map((chunk) => {
        const body = chunk.text.toLowerCase();
        const title = `${chunk.sectionTitle} ${chunk.documentName}`.toLowerCase();
        const compactBody = this.compact(body);
        const compactTitle = this.compact(title);
        let score = 0;
        let matches = 0;
        for (const word of words) {
          let matched = false;
          if (body.includes(word)) { score += 7; matched = true; }
          else if (compactBody.includes(this.compact(word))) { score += 4; matched = true; }
          if (title.includes(word) || compactTitle.includes(this.compact(word))) {
            score += 5; matched = true;
          }
          if (matched) matches++;
        }
        score += matches >= 2 ? 4 * matches : 0;
        if (queryPhrase.length >= 4 && compactBody.includes(queryPhrase)) score += 9;
        return { chunk, score, matches };
      }));
      const context = scored.filter((x) => x.score > 0)
        .sort((a, b) => b.matches - a.matches || b.score - a.score || a.chunk.order - b.chunk.order)
        .slice(0, limit)
        .map((entry) => ({ ...entry.chunk, score: entry.score }));
      return { ...base, mode: context.length ? "search" : "no-match", context, words };
    }

    static excerpt(chunk, words, limit = 235) {
      // A short chunk is the most reliable excerpt: preserve amounts, deadlines,
      // and necessary context instead of taking only the matching heading.
      if (Array.from(chunk.text).length <= limit) return chunk.text.trim();
      const lines = chunk.text.split(/(?<=[.!?。])\s+|\n+/u).map((line) => line.trim()).filter(Boolean);
      let best = { text: chunk.text, score: -1 };
      for (const line of lines) {
        const compact = this.compact(line);
        const matches = words.reduce((n, word) => n + Number(compact.includes(this.compact(word))), 0);
        const score = matches * 10 + (/[.!?。]$/u.test(line) ? 3 : 0) +
          (/[0-9]/u.test(line) ? 2 : 0) + Math.min(line.length / 100, 1);
        if (score > best.score) best = { text: line, score };
      }
      let result = best.text;
      if (Array.from(result).length > limit && words.length) {
        const lowered = result.toLowerCase();
        const starts = words.map((word) => lowered.indexOf(word)).filter((index) => index >= 0);
        if (starts.length) {
          const chars = Array.from(result);
          const charStart = Array.from(result.slice(0, Math.min(...starts))).length;
          const offset = Math.max(0, charStart - 45);
          result = (offset ? "…" : "") + chars.slice(offset, offset + limit).join("");
        }
      }
      return shorten(result, limit);
    }
  }

  function buildMockAnswer(question, retrieval) {
    const { context = [], mode = "no-match", documents = [], words = [] } = retrieval || {};
    const names = documents.join(", ");
    const header = "[업로드 문서 기반 검색 · 모의 RAG]\n";
    if (mode === "empty") {
      return header + "\n검색 가능한 TXT 문서가 없습니다. 왼쪽에서 텍스트 파일을 업로드한 뒤 질문해 주세요. " +
        "PDF는 현재 본문 검색을 지원하지 않습니다.\n\n※ 실제 AI 모델을 사용하지 않는 로컬 데모입니다.";
    }
    if (mode === "needs-keyword") {
      return header + `\n현재 분석 대상: ${names}\n\n질문에서 검색어를 인식하지 못했습니다. ` +
        "'이 문서 요약해줘' 또는 '교육 일정은?'처럼 질문해 주세요.";
    }
    if (mode === "no-match") {
      return header + `\n현재 분석 대상: ${names}\n질문: ${question}\n\n` +
        "이 문서의 실제 텍스트에서 질문과 일치하는 근거를 찾지 못했습니다. " +
        "오른쪽의 분석 대상 선택과 왼쪽 청크 내용을 확인하거나, 문서에 있는 구체적인 명사로 다시 질문해 주세요. " +
        "전체 내용을 보려면 '이 문서 요약해줘'라고 입력할 수 있습니다.\n\n" +
        "※ 실제 의미 검색이나 LLM 추론이 아닌 키워드 검색입니다.";
    }
    const snippets = context.map((c, index) =>
      `${index + 1}. [${c.documentName} / ${c.sectionTitle} · 청크 ${c.order}]\n   “${LocalRetriever.excerpt(c, words, 240)}”`
    );
    const lead = mode === "overview"
      ? `분석 대상 문서: ${names}\n\n문서의 섹션별 주요 부분 ${context.length}개를 발췌했습니다. (추출식 요약, AI 요약 아님)`
      : `분석 대상 문서: ${names}\n질문: ${question}\n\n질문과 관련된 원문 청크 ${context.length}개를 검색했습니다.`;
    return header + "\n" + lead + "\n\n" + snippets.join("\n\n") +
      "\n\n출처 버튼을 클릭하면 원문 청크를 확인할 수 있습니다. " +
      "발췌되지 않은 내용은 판단하지 않았습니다.\n\n※ AI 모델·벡터 DB를 사용하지 않는 로컬 검색 데모입니다.";
  }

  // ─────────────────────────── Network boundary ──────────────────────────
  // Fetch-shaped mock returns a REAL Response backed by a REAL ReadableStream.
  // Swap mockRagFetch for window.fetch when deploying a compatible backend.
  async function mockRagFetch(url, options = {}) {
    if (url !== CONFIG.API_ENDPOINT || options.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (options.signal?.aborted) throw new DOMException("요청이 취소되었습니다.", "AbortError");
    const payload = JSON.parse(options.body || "{}");
    const output = Array.from(buildMockAnswer(payload.question || "", payload.retrieval || {}));
    const encoder = new TextEncoder();
    let position = 0;
    let timer = null;
    let finished = false;
    let streamController;
    const signal = options.signal;
    const cleanup = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      try { streamController?.error(new DOMException("요청이 취소되었습니다.", "AbortError")); } catch { /* reader already closed */ }
    };
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setInterval(() => {
          if (finished) return;
          if (position >= output.length) {
            finished = true;
            cleanup();
            controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
            controller.close();
            return;
          }
          const part = output.slice(position, position + 12).join("");
          position += 12;
          const ndjson = JSON.stringify({ type: "delta", text: part }) + "\n";
          controller.enqueue(encoder.encode(ndjson));
        }, CONFIG.MOCK_INTERVAL_MS);
      },
      cancel() { finished = true; cleanup(); }
    });
    return new Response(stream, { status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
  }

  class RagApiClient {
    constructor(fetchAdapter = mockRagFetch) { this.fetchAdapter = fetchAdapter; }

    async stream(question, retrieval, onDelta, signal) {
      // Endpoint contract: POST /api/rag-query → NDJSON {type:'delta',text:'...'} lines.
      const response = await this.fetchAdapter(CONFIG.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson" },
        body: JSON.stringify({ question, retrieval }),
        signal
      });
      if (!response.ok) throw new Error(`RAG API 응답 오류: HTTP ${response.status}`);
      if (!response.body) throw new Error("스트리밍 응답을 지원하지 않습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      const decodeLine = (line) => {
        if (!line.trim()) return;
        const message = JSON.parse(line);
        if (message.type === "delta" && typeof message.text === "string") onDelta(message.text);
        if (message.type === "error") throw new Error(message.message || "RAG 서버 오류");
      };
      try {
        while (true) {
          if (signal?.aborted) throw new DOMException("요청이 취소되었습니다.", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let end;
          while ((end = pending.indexOf("\n")) !== -1) {
            decodeLine(pending.slice(0, end));
            pending = pending.slice(end + 1);
          }
        }
        pending += decoder.decode();
        if (pending.trim()) decodeLine(pending);
      } finally {
        reader.releaseLock();
      }
    }
  }

  // ─────────────────────────── Presentation layer ────────────────────────
  class DocumentView {
    constructor(store) {
      this.store = store;
      this.list = $("#document-list");
      this.visibleCounts = new Map();
      this.list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-show-more]");
        if (!button) return;
        const key = button.dataset.showMore;
        this.visibleCounts.set(key, (this.visibleCounts.get(key) || CONFIG.FIRST_CHUNKS_SHOWN) + 8);
        this.render(this.store.state.documents);
        const node = this.list.querySelector(`[data-section-id="${CSS.escape(key)}"]`);
        if (node) node.open = true;
      });
    }

    setPipeline(stage) {
      const labels = { idle: ["대기", "대기", "대기"], read: ["진행 중", "대기", "대기"],
        chunk: ["완료", "진행 중", "대기"], ready: ["완료", "완료", "준비됨"] };
      const values = labels[stage] || labels.idle;
      ["read", "chunk", "index"].forEach((key, i) => {
        const row = this.list.closest(".sidebar").querySelector(`[data-stage="${key}"]`);
        row.classList.toggle("done", (stage === "ready") || (stage === "chunk" && i === 0));
        $(`#status-${key}`).textContent = values[i];
      });
    }

    render(documents) {
      $("#document-count").textContent = formatNumber(documents.length);
      $("#chunk-count").textContent = formatNumber(documents.reduce((n, d) => n + d.chunks.length, 0));
      $("#character-count").textContent = formatNumber(documents.reduce((n, d) => n + d.characters, 0));
      $("#index-badge").textContent = `${documents.length}개 문서`;
      this.list.replaceChildren();
      if (!documents.length) {
        const empty = h("div", "empty-documents");
        empty.append(h("span", "empty-glyph", "▤"), h("p", "", "문서를 업로드하면 목차와 청크가 이곳에 표시됩니다."));
        this.list.append(empty);
        this.setPipeline("idle");
        return;
      }
      const fragment = document.createDocumentFragment();
      for (const doc of documents) {
        const docDetails = h("details", "doc-item");
        docDetails.dataset.documentId = doc.id;
        docDetails.open = true;
        const summary = h("summary");
        const glyph = h("span", "file-icon", doc.kind.toUpperCase());
        const desc = h("span", "file-summary");
        desc.append(h("strong", "", doc.name), h("small", "", `${doc.sections.length}개 섹션 · ${doc.chunks.length}개 청크 · ${doc.encoding || "PDF"}`));
        docDetails.classList.toggle("is-active", this.store.state.activeDocumentId === doc.id);
        summary.append(glyph, desc);
        docDetails.append(summary);
        const inner = h("div", "doc-inner");
        if (!doc.searchable) inner.append(h("p", "pdf-notice", "PDF 데모: 실제 원문 추출 없음 · 검색에서 제외"));
        for (const section of doc.sections) {
          const sectionDetails = h("details", "section-item");
          sectionDetails.dataset.sectionId = section.id;
          sectionDetails.open = true;
          const sectionSummary = h("summary");
          sectionSummary.append(h("span", "", shorten(section.title, 42)),
            h("span", "section-meta", `${section.chunks.length} 청크`));
          sectionDetails.append(sectionSummary);
          const list = h("ol", "chunks");
          const visible = this.visibleCounts.get(section.id) || CONFIG.FIRST_CHUNKS_SHOWN;
          for (const chunk of section.chunks.slice(0, visible)) {
            const item = h("li", "chunk");
            item.id = `chunk-${chunk.id}`;
            const head = h("div", "chunk-top");
            head.append(h("strong", "", `CHUNK ${String(chunk.order).padStart(2, "0")}`),
              h("small", "", chunk.simulated ? "가상 청크" : `${Array.from(chunk.text).length}자`));
            item.append(head, h("p", "", shorten(chunk.text, 190)));
            list.append(item);
          }
          sectionDetails.append(list);
          if (section.chunks.length > visible) {
            const more = h("button", "more-chunks", `청크 ${section.chunks.length - visible}개 더 보기`);
            more.type = "button";
            more.dataset.showMore = section.id;
            sectionDetails.append(more);
          }
          inner.append(sectionDetails);
        }
        docDetails.append(inner);
        fragment.append(docDetails);
      }
      this.list.append(fragment);
    }

    focusChunk(chunkId) {
      const doc = this.store.state.documents.find((d) => d.chunks.some((c) => c.id === chunkId));
      if (!doc) return;
      const chunk = doc.chunks.find((c) => c.id === chunkId);
      const section = doc.sections.find((s) => s.id === chunk.sectionId);
      const position = section.chunks.findIndex((c) => c.id === chunkId);
      this.visibleCounts.set(section.id, Math.max(this.visibleCounts.get(section.id) || CONFIG.FIRST_CHUNKS_SHOWN, position + 1));
      this.render(this.store.state.documents);
      const item = document.getElementById(`chunk-${chunkId}`);
      if (item) {
        item.classList.add("highlight");
        item.tabIndex = -1;
        item.focus({ preventScroll: true });
        item.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      }
    }
  }

  class ChatView {
    constructor(onCitation) {
      this.messages = $("#messages");
      this.scroll = $("#conversation-scroll");
      this.followTail = true;
      this.onCitation = onCitation;
      this.scroll.addEventListener("scroll", () => {
        this.followTail = this.scroll.scrollHeight - this.scroll.scrollTop - this.scroll.clientHeight < 125;
      }, { passive: true });
      this.messages.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-citation-id]");
        if (button) this.onCitation(button.dataset.citationId);
      });
    }

    announce(text) { $("#sr-announcer").textContent = text; }
    scrollToBottom(force = false) {
      if (force || this.followTail) {
        this.scroll.scrollTop = this.scroll.scrollHeight;
        this.followTail = true;
      }
    }

    appendMessage(message) {
      $("#welcome").hidden = true;
      const article = h("article", `message ${message.role}`);
      article.dataset.messageId = message.id;
      article.setAttribute("aria-label", message.role === "user" ? "사용자 메시지" : "데모 답변");
      const avatar = h("span", "avatar", message.role === "user" ? "나" : "AI");
      avatar.setAttribute("aria-hidden", "true");
      const content = h("div", "message-content");
      const label = h("span", "message-label", `${message.role === "user" ? "사용자" : "문서 도우미"} · ${message.time}`);
      const bubble = h("div", "message-bubble");
      const body = h("div", "message-body", message.text);
      if (message.streaming) body.classList.add("is-streaming");
      bubble.append(body);
      content.append(label, bubble);
      article.append(avatar, content);
      this.messages.append(article);
      this.scrollToBottom(true);
      return article;
    }

    updateAnswer(messageId, content) {
      const node = [...this.messages.children].find((el) => el.dataset.messageId === messageId);
      if (!node) return;
      node.querySelector(".message-body").textContent = content;
      this.scrollToBottom();
    }

    finishAnswer(messageId, text, citations = []) {
      const node = [...this.messages.children].find((el) => el.dataset.messageId === messageId);
      if (!node) return;
      const body = node.querySelector(".message-body");
      body.textContent = text;
      body.classList.remove("is-streaming");
      const bubble = node.querySelector(".message-bubble");
      if (citations.length) {
        const sources = h("div", "source-list");
        sources.append(h("span", "", "참고 근거"));
        citations.forEach((chunk, i) => {
          const button = h("button", "source-chip", `근거 ${i + 1}: ${shorten(chunk.sectionTitle, 14)}`);
          button.type = "button";
          button.dataset.citationId = chunk.id;
          button.setAttribute("aria-label", `근거 ${i + 1}, ${chunk.documentName}, ${chunk.sectionTitle} 청크로 이동`);
          sources.append(button);
        });
        bubble.append(sources);
      }
      this.scrollToBottom();
    }
  }

  // Consume incoming network bytes and paint a small number of characters/frame.
  // Layout remains stable: only message text and scrollTop change, animations use opacity/transform.
  class StreamTypewriter {
    constructor(onUpdate) {
      this.onUpdate = onUpdate;
      this.pending = [];
      this.text = "";
      this.frame = null;
      this.closed = false;
      this.finishResolve = null;
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    add(delta) {
      if (this.closed) return;
      for (const character of delta) this.pending.push(character);
      this.schedule();
    }

    schedule() {
      if (this.frame !== null) return;
      if (document.hidden || this.reducedMotion) {
        this.consumeAll();
        return;
      }
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        const text = this.pending.splice(0, 5).join("");
        if (text) {
          this.text += text;
          this.onUpdate(this.text);
        }
        if (this.pending.length) this.schedule();
        else if (this.closed) this.finishResolve?.();
      });
    }

    consumeAll() {
      if (this.pending.length) {
        this.text += this.pending.splice(0).join("");
        this.onUpdate(this.text);
      }
      if (this.closed) this.finishResolve?.();
    }

    finish() {
      this.closed = true;
      return new Promise((resolve) => {
        this.finishResolve = resolve;
        if (!this.pending.length && this.frame === null) resolve();
        else this.schedule();
      });
    }

    cancel() {
      this.closed = true;
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.pending = [];
      this.finishResolve?.();
    }
  }

  // ─────────────────────────── App controller ────────────────────────────
  class AppController {
    constructor() {
      this.store = new AppStore();
      this.documentView = new DocumentView(this.store);
      this.chatView = new ChatView((chunkId) => this.documentView.focusChunk(chunkId));
      this.api = new RagApiClient(CONFIG.DEMO_MODE ? mockRagFetch : window.fetch.bind(window));
      this.activeController = null;
      this.activeTypewriter = null;
      this.importing = false;
      this.store.subscribe((state, change) => {
        if (change === "documents" || change === "scope") {
          this.documentView.render(state.documents);
          this.renderDocumentScope();
        }
      });
      this.documentView.render([]);
      this.renderDocumentScope();
      this.initializeTheme();
      this.bindEvents();
    }

    renderDocumentScope() {
      const select = $("#document-scope");
      const { documents, activeDocumentId } = this.store.state;
      const current = documents.find((doc) => doc.id === activeDocumentId);
      const fragment = document.createDocumentFragment();
      const allOption = new Option("전체 등록 문서 (검색 가능한 TXT)", "all");
      fragment.append(allOption);
      for (const doc of documents) {
        if (!doc.searchable) continue;
        fragment.append(new Option(`${doc.name} · ${doc.chunks.length}청크`, doc.id));
      }
      select.replaceChildren(fragment);
      select.value = current?.searchable ? current.id : "all";
      const searchableCount = documents.filter((d) => d.searchable).length;
      const label = current?.searchable ? current.name :
        (searchableCount ? `전체 텍스트 문서 ${searchableCount}개` : "업로드된 텍스트 문서 없음");
      $("#scope-hint").textContent = current?.searchable
        ? `현재 선택된 문서만 검색합니다: ${current.chunks.length}개 청크.`
        : `검색 가능한 텍스트 파일 ${searchableCount}개 · PDF는 검색 제외`;
      $("#active-target").textContent = `현재 검색 대상: ${label}`;
    }

    setFeedback(message, error = false) {
      const node = $("#upload-feedback");
      node.textContent = message;
      node.classList.toggle("error", error);
    }

    initializeTheme() {
      let stored;
      try { stored = localStorage.getItem("docflow-theme"); } catch { /* blocked storage */ }
      const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
      this.setTheme(stored === "dark" || (!stored && prefersDark) ? "dark" : "light");
    }

    setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      this.store.update({ theme }, "theme");
      $("#theme-toggle").setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      $("#theme-toggle").setAttribute("aria-label", theme === "dark" ? "라이트 모드로 변경" : "다크 모드로 변경");
      $("#theme-label").textContent = theme === "dark" ? "라이트 모드" : "다크 모드";
      document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0f1729" : "#f5f7fb";
      try { localStorage.setItem("docflow-theme", theme); } catch { /* optional */ }
    }

    bindEvents() {
      $("#theme-toggle").addEventListener("click", () => this.setTheme(this.store.state.theme === "light" ? "dark" : "light"));
      $("#document-scope").addEventListener("change", (event) => {
        this.store.update({ activeDocumentId: event.target.value }, "scope");
      });
      const drop = $("#drop-zone");
      const input = $("#file-input");
      drop.addEventListener("click", () => input.click());
      drop.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); input.click();
        }
      });
      for (const eventName of ["dragenter", "dragover"]) {
        drop.addEventListener(eventName, (event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
          drop.classList.add("is-dragover");
        });
      }
      drop.addEventListener("dragleave", (event) => {
        event.preventDefault();
        if (!drop.contains(event.relatedTarget)) drop.classList.remove("is-dragover");
      });
      drop.addEventListener("drop", (event) => {
        event.preventDefault();
        drop.classList.remove("is-dragover");
        void this.importFiles([...event.dataTransfer.files]);
      });
      input.addEventListener("change", () => {
        void this.importFiles([...input.files]);
        input.value = "";
      });
      $("#load-sample").addEventListener("click", () => {
        if (this.store.state.documents.length >= CONFIG.MAX_FILES) {
          this.setFeedback(`최대 ${CONFIG.MAX_FILES}개까지 등록할 수 있습니다.`, true);
          return;
        }
        if (this.store.state.busy || this.importing) {
          this.setFeedback("현재 작업이 끝난 후 문서를 추가해 주세요.", true);
          return;
        }
        const doc = DocumentService.buildTextDocument("2026_사내공지사항_샘플.txt", SAMPLE_TEXT,
          new TextEncoder().encode(SAMPLE_TEXT).byteLength);
        this.store.update({ documents: [...this.store.state.documents, doc], activeDocumentId: doc.id }, "documents");
        this.documentView.setPipeline("ready");
        this.setFeedback("샘플 공지사항이 인덱싱되었습니다. 질문을 입력해 보세요.");
        this.chatView.announce("샘플 문서가 추가되었습니다.");
      });
      $("#clear-documents").addEventListener("click", () => {
        if (this.store.state.busy || this.importing) {
          this.setFeedback("작업 중에는 문서를 삭제할 수 없습니다.", true);
          return;
        }
        this.store.update({ documents: [], activeDocumentId: "all" }, "documents");
        this.setFeedback("문서가 삭제되었습니다. 대화 내역은 유지됩니다.");
        this.chatView.announce("등록 문서를 모두 삭제했습니다.");
      });
      $("#chat-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void this.sendQuestion($("#question-input").value);
      });
      $("#question-input").addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          $("#chat-form").requestSubmit();
        }
      });
      $("#cancel-button").addEventListener("click", () => this.activeController?.abort());
      document.querySelectorAll("[data-suggestion]").forEach((button) => {
        button.addEventListener("click", () => {
          $("#question-input").value = button.dataset.suggestion;
          $("#chat-form").requestSubmit();
        });
      });
    }

    async importFiles(files) {
      if (!files.length) return;
      if (this.store.state.busy || this.importing) {
        this.setFeedback("현재 작업이 끝난 뒤 파일을 다시 선택하세요.", true);
        return;
      }
      this.importing = true;
      try {
        const remaining = CONFIG.MAX_FILES - this.store.state.documents.length;
        if (remaining <= 0) {
          this.setFeedback(`최대 ${CONFIG.MAX_FILES}개입니다. 같은 파일을 다시 등록하려면 기존 문서를 삭제하세요.`, true);
          return;
        }
        const selected = files.slice(0, remaining);
        const errors = [];
        const imported = [];
        const manualEncoding = $("#text-encoding").value;
        this.documentView.setPipeline("read");
        for (const file of selected) {
          const lower = file.name.toLowerCase();
          const isPdf = lower.endsWith(".pdf");
          const extension = lower.match(/\.([a-z0-9]+)$/)?.[1] || "";
          if (!isPdf && !["txt", "md", "csv", "log"].includes(extension)) {
            errors.push(`${file.name}: TXT, MD, CSV, LOG 또는 PDF 파일을 선택해 주세요.`);
            continue;
          }
          if (file.size > (isPdf ? CONFIG.MAX_PDF_BYTES : CONFIG.MAX_TEXT_BYTES)) {
            errors.push(`${file.name}: 크기 제한(텍스트 2MiB, PDF 2MiB)을 넘었습니다.`);
            continue;
          }
          try {
            const data = await DocumentService.readFile(file);
            this.documentView.setPipeline("chunk");
            let documentModel;
            if (isPdf) {
              documentModel = DocumentService.buildPdfDemoDocument(file, data);
            } else {
              const decoded = DocumentService.decodeText(data, manualEncoding);
              documentModel = DocumentService.buildTextDocument(
                file.name, decoded.text, file.size, decoded.encoding, extension
              );
            }
            // Reuploading the same filename replaces its old index, rather than
            // mixing stale chunks with the new document's content.
            const otherDocs = this.store.state.documents.filter(
              (doc) => doc.name.toLowerCase() !== file.name.toLowerCase()
            );
            this.store.update({
              documents: [...otherDocs, documentModel],
              activeDocumentId: documentModel.searchable ? documentModel.id : (
                otherDocs.some((doc) => doc.id === this.store.state.activeDocumentId)
                  ? this.store.state.activeDocumentId : "all")
            }, "documents");
            imported.push(documentModel);
          } catch (error) {
            errors.push(`${file.name}: ${error.message}`);
          }
        }
        const doc = [...imported].reverse().find((entry) => entry.searchable);
        if (doc) this.store.update({ activeDocumentId: doc.id }, "scope");
        this.documentView.setPipeline(this.store.state.documents.length ? "ready" : "idle");
        const completed = imported.map((entry) =>
          `${entry.name} (${entry.searchable ? `${entry.encoding}, ${entry.chunks.length}청크` : "PDF 구조 데모"})`
        ).join(" / ");
        const message = `${imported.length}개 등록 완료.` + (completed ? ` ${completed}. ` : " ") +
          (doc ? `현재 분석 대상: ${doc.name}. 질문하거나 '이 문서 요약해줘'를 입력하세요.` : "") +
          (errors.length ? ` 오류: ${errors.join(" / ")}` : "") +
          (files.length > selected.length ? ` 최대 ${CONFIG.MAX_FILES}개까지 등록됩니다.` : "");
        this.setFeedback(message, errors.length > 0);
        if (imported.length) this.chatView.announce(`${imported.length}개 문서 추가. 분석 대상이 설정되었습니다.`);
      } finally {
        this.importing = false;
      }
    }

    setBusy(busy) {
      this.store.update({ busy }, "busy");
      $("#send-button").hidden = busy;
      $("#cancel-button").hidden = !busy;
      $("#question-input").disabled = busy;
      $("#chat-feedback").textContent = busy ? "모의 스트리밍 응답을 생성하고 있습니다" : "모의 API · 실제 AI 모델 미사용";
    }

    async sendQuestion(raw) {
      if (this.store.state.busy || this.importing) return;
      const question = String(raw).trim();
      if (!question) return;
      const docs = this.store.state.activeDocumentId === "all"
        ? this.store.state.documents
        : this.store.state.documents.filter((d) => d.id === this.store.state.activeDocumentId);
      const retrieval = LocalRetriever.retrieve(question, docs);
      const context = retrieval.context;
      const makeMessage = (role, text, streaming = false) => ({
        id: newId(), role, text, streaming,
        time: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      });
      const user = makeMessage("user", question);
      const assistant = makeMessage("assistant", "관련 근거를 검색하고 있습니다…", true);
      this.store.update({ messages: [...this.store.state.messages, user, assistant] }, "messages");
      this.chatView.appendMessage(user);
      this.chatView.appendMessage(assistant);
      this.chatView.announce("질문이 대화에 추가되었습니다. 답변을 생성합니다.");
      $("#question-input").value = "";
      this.activeController = new AbortController();
      const typer = new StreamTypewriter((text) => this.chatView.updateAnswer(assistant.id, text));
      this.activeTypewriter = typer;
      this.setBusy(true);
      let answer = "";
      let citations = [];
      try {
        await this.api.stream(question, retrieval, (delta) => typer.add(delta), this.activeController.signal);
        await typer.finish();
        answer = typer.text;
        citations = context;
        this.chatView.announce("데모 답변 생성이 완료되었습니다. 근거 청크를 확인할 수 있습니다.");
      } catch (error) {
        typer.cancel();
        const cancelled = error.name === "AbortError" || this.activeController.signal.aborted;
        answer = (typer.text ? typer.text + "\n\n" : "") +
          (cancelled ? "[응답이 사용자에 의해 중단되었습니다.]" : `[오류] ${error.message}`);
        this.chatView.announce(cancelled ? "답변 생성이 중단되었습니다." : "답변 생성 중 오류가 발생했습니다.");
      } finally {
        this.chatView.finishAnswer(assistant.id, answer, citations);
        const messages = this.store.state.messages.map((message) => message.id === assistant.id
          ? { ...message, text: answer, streaming: false, citations }
          : message);
        this.store.update({ messages }, "messages");
        this.activeController = null;
        this.activeTypewriter = null;
        this.setBusy(false);
        $("#question-input").focus({ preventScroll: true });
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => new AppController());
})();
