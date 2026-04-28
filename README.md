# KPC-Injae-Kium

한국생산성본부(KPC) **인재키움 직무교육센터** 안내 사이트.

우선지원대상기업 재직자 대상 직무교육 과정을 소개하고 검색하는 정적 웹사이트입니다. 수료 시 교육비 90% 환급 제도(고용보험 환급) 기준으로 안내합니다.

## Stack

- 순수 정적 HTML / CSS / Vanilla JS (빌드 단계 없음)
- `courses_grouped.json` 기반 동적 과정 카드 렌더링 + 필터/검색/정렬
- Vercel 정적 호스팅

## 주요 페이지

- **`index.html`** — 메인 랜딩. 90% 환급 안내, 8개 분야 카테고리, 신청 프로세스, FAQ
- **`courses.html`** — 전체 과정 검색·필터. 201개 고유 과정 / 575개 차수, 분야·지역·월 필터

## 로컬 실행

```bash
python3 -m http.server 4173
# http://localhost:4173
```

`courses.html`이 `fetch('courses_grouped.json')`을 사용하므로 반드시 정적 서버 경유 필요 (file:// 직접 열기 X).

## 배포

```bash
vercel deploy --yes --scope werooring-3134s-projects
```

## 모바일 반응형

데스크탑 출력은 변경 없이 유지하면서 모바일 전용 미디어 쿼리로만 최적화:

- 햄버거 메뉴 (≤960px)
- hero 영역 인라인 style override (≤720px)
- 과정 카드/세션 1열 stack (≤760px)
