# DocFlow: 브라우저 기반 문서 RAG 대시보드 데모

## 1. 프로젝트 개요

- **기술**: HTML5, CSS3 (Grid, Flexbox, CSS Custom Properties), Vanilla JavaScript
- **라이브러리**: 없음. React, Vue, 빌드 도구, CDN 미사용
- **배포**: GitHub Pages를 포함한 정적 웹 호스팅
- **목적**: 사내 공지사항의 텍스트 추출·청크 분할·검색·근거 인용·스트리밍 UI를 학습할 수 있는 **로컬 시뮬레이션**

중요: 이 버전은 **실제 생성형 AI나 벡터 검색 엔진을 호출하지 않습니다.** TXT 내용을 로컬 키워드 검색하고, 그 결과를 `ReadableStream`으로 흘려보내는 **모의 RAG**입니다. 화면의 'AI' 명칭은 예제 인터페이스를 설명하기 위한 것입니다.

## 2. 파일 구성

```text
rag_dashboard/
├── index.html                        # 시맨틱 마크업, 접근성, 좌우 패널
├── style.css                         # 라이트/다크 CSS 변수, Grid/Flex 반응형
├── app.js                            # 상태/파싱/검색/모의 API/렌더링/컨트롤러
├── samples/
│   └── 2026_사내공지사항_샘플.txt        # 실습용 가상 공지사항
├── .nojekyll                         # GitHub Pages에서 Jekyll 처리 건너뜀
└── README.md
```

## 3. 사용하기

1. `index.html`을 크롬에서 엽니다. 또는 아래 GitHub Pages 배포 절차를 따릅니다.
2. 좌측 **샘플 문서 불러오기**를 클릭하거나 `.txt` 파일을 드래그 앤 드롭합니다.
3. **문서 구조 및 청크**에서 목차와 청크(500자, 60자 중첩)를 확인합니다.
4. 우측 질문 입력창에서 질문하고 Enter를 눌러 답변을 생성합니다.
5. 스트리밍 출력 이후 **근거 1** 등의 버튼을 눌러 해당 청크로 이동합니다.
6. 상단 다크 모드 토글로 테마를 변경합니다.
7. 답변 중 **중단** 버튼을 누르면 `AbortController`가 스트림을 취소합니다.

### 질문 예시

- 재택근무 신청 방법이 무엇인가요?
- 비밀번호 변경 주기는 어떻게 되나요?
- 교육비 지원 기준을 알려줘
- 연차 휴가는 언제까지 신청해야 하나요?

## 4. GitHub Pages 배포 — Chrome 브라우저만 사용

1. 크롬에서 `https://github.com`으로 이동하여 로그인합니다.
2. **New repository**를 선택하고 `rag-dashboard`라는 새 저장소를 만듭니다.
3. 저장소의 **Add file → Upload files**를 선택합니다.
4. 이 프로젝트의 **압축을 풀어**, `index.html`, `style.css`, `app.js`, `samples` 폴더 및 `README.md`를 **저장소 루트**에 업로드합니다. ZIP 자체를 업로드하지 않습니다.
5. **Commit changes**를 눌러 저장합니다.
6. **Settings → Pages → Build and deployment**에서 Source를 **Deploy from a branch**로 설정합니다.
7. Branch `main`, Folder `/(root)`를 선택한 뒤 **Save**합니다.
8. 사이트가 공개되면 `https://사용자아이디.github.io/rag-dashboard/`로 접속합니다.

정적 배포된 사이트에서도 모의 스트리밍이 실행됩니다. **실제 `/api/rag-query` 서버는 GitHub Pages에 자동으로 생성되지 않습니다.**

## 5. 아키텍처

```text
┌────────────────────── UI (index.html / style.css) ──────────────────┐
│ DocumentView (좌측 파싱/청크)       ChatView (우측 메시지/근거)       │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ AppController (이벤트, 상태 전이)
                         ┌──────┴──────────┐
                         │   AppStore      │ → documents, messages, busy, theme
                         └──────┬──────────┘
        ┌───────────────────────┼──────────────────────────┐
        ▼                       ▼                          ▼
DocumentService            LocalRetriever             RagApiClient
 - FileReader              - 키워드 점수              - POST /api/rag-query
 - 섹션 추출                 - 상위 3개 청크             - NDJSON 스트림 해석
 - 500자/60자 분할                                      - mockRagFetch 교체 가능
                                                             │
                                                             ▼
                                                       StreamTypewriter
                                                     requestAnimationFrame
```

`AppStore`가 영속 데이터의 단일 소스이며 문서 목록은 상태 변경 시 다시 렌더링됩니다. 출력 중인 메시지는 성능상 텍스트 노드만 증분 수정하고, 최종 완성 텍스트를 메시지 상태에 반영합니다.

## 6. 모의 스트리밍 API 계약

프론트엔드는 `/api/rag-query`로 다음과 같은 요청을 보냅니다(현재 `fetch`와 동일한 인터페이스의 `mockRagFetch`가 응답):

```http
POST /api/rag-query
Content-Type: application/json
Accept: application/x-ndjson
```

```json
{"question":"재택근무 신청 방법은?","context":[{"documentName":"notice.txt","sectionTitle":"인사팀","text":"..."}]}
```

응답은 줄바꿈으로 구분된 JSON(NDJSON) 스트림입니다.

```text
{"type":"delta","text":"관련 문서에서 "}
{"type":"delta","text":"근거를 찾았습니다."}
{"type":"done"}
```

`RagApiClient.stream()`은 `response.body.getReader()`로 `Uint8Array` 청크를 읽고 `TextDecoder`로 UTF-8 경계를 안전하게 처리합니다. `StreamTypewriter`는 `requestAnimationFrame`으로 코드 포인트 단위 텍스트를 점진적으로 출력합니다. 사용자가 애니메이션 감소를 요청했거나 탭이 백그라운드면 대기 중인 텍스트를 즉시 반영합니다.

실제 서버가 준비되면 `app.js`에서 `CONFIG.DEMO_MODE = false`로 바꾸고, `CONFIG.API_ENDPOINT`를 실제 HTTPS 백엔드 엔드포인트로 설정한 다음, 서버에서 위 NDJSON 형식과 적절한 CORS·인증을 지원해야 합니다. **API 키를 브라우저 JS에 하드코딩하면 안 됩니다.** 실제 서비스에서는 문서 업로드·색인·벡터 검색·LLM 호출을 서버 측에서 구현하십시오.

## 7. 파일별 실제 구현 범위

| 파일 유형 | FileReader | 청크 화면 | 검색과 인용 |
|---|---|---|---|
| `.txt` | `readAsText`로 실제 UTF-8 텍스트 읽기 | 실제 500자 청크 | 로컬 키워드 검색에 포함 |
| `.pdf` | `readAsArrayBuffer`로 파일 헤더 확인 | 메타데이터 기반 **가상 청크 1개** | **제외** — 실제 PDF 문장·목차 미추출 |

**주의:** `<input type=file>`이나 FileReader만으로 일반적인 PDF의 텍스트와 목차를 안정적으로 파싱할 수 없습니다. 진짜 PDF 내용 검색에는 PDF.js 같은 파서 또는 서버 측 PDF 처리(OCR 포함)가 별도로 필요합니다. 가상 청크는 실제 PDF의 내용인 것처럼 표시하지 않습니다.

기본 TXT 파일 최대 512KiB, PDF 최대 2MiB, 최대 8개 파일로 제한합니다. 확장자만 신뢰하지 않으며 PDF에는 `%PDF-` 파일 서명 확인을 적용합니다. 이 검사는 보안 검증 전체를 대신하지 않습니다.

## 8. 접근성 및 성능

- `<header>`, `<nav>`, `<aside>`, `<main>`, `<section>`, `<article>`, `<footer>` 사용
- 업로드 존은 `role="button"`, `tabindex="0"`, `aria-label` 및 Enter/Space 키 지원
- 별도 `role="status" aria-live="polite"` 요소를 사용해 **새 메시지와 완료 상태만** 알림. 스트리밍 문자별 반복 읽기는 방지
- 화면이 자동으로 스크롤되지만, 사용자가 이전 대화를 읽기 위해 위로 이동하면 강제 스크롤을 중단
- 애니메이션 키프레임은 `transform`, `opacity`만 활용
- `prefers-reduced-motion`을 존중
- 문서명·문서본문·질문은 `textContent`로 렌더링하여 HTML 삽입을 피함
- 문서 원본 텍스트는 메모리에서만 보관하며 새로고침 시 초기화. 테마 값만 로컬 저장

## 9. 운영 및 개인정보보호 주의사항

- GitHub Pages는 공개 웹 호스팅입니다. **실제 회사의 비공개 공지, 인사 문서, 고객정보를 GitHub 저장소에 올리지 마세요.**
- 데모는 로컬 파일 데이터를 서버에 전송하지 않습니다(`mockRagFetch`). 단, 실제 API 모드로 바꾸면 업로드된 문서 청크가 요청 페이로드에 포함될 수 있으므로 정보보안 검토가 필요합니다.
- 이 샘플의 공지사항은 실습을 위한 **허구의 데이터**입니다. 실제 회사 규정으로 사용하지 마세요.
- 실제 서비스에서는 인증·권한 검증·문서 접근 제어·저장/전송 암호화·개인정보 삭제 정책·서버 측 파일 검사 등을 적용해야 합니다.

## 10. 검증한 사용자 동작

Chrome(Chromium) 환경에서 HTML/CSS/JS를 로드하여 다음 기능을 테스트했습니다: 샘플 로드, 청크 생성, 질의, 스트리밍 완료, 근거 링크 이동, 테마 토글, TXT 입력, PDF 메타데이터 데모와 검색 제외, 응답 중단, 모바일 폭에서 가로 스크롤 없음, JS 오류 없음. **실제 GitHub Pages 서버에 게시한 테스트는 아닙니다.**
