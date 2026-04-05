# 토플메이트 어휘 암기 기능 UX/UI 디자인 스펙

> 작성일: 2026-04-05
> 대상: 구현 담당 개발자
> 데이터 소스: Turso DB (user `hajiyeon`, id=1, 카테고리 "BOB TOEFL", 97단어, PRIVATE)
> 디자인 시스템: `static/css/app.css` 기존 CSS 변수 준수
> 주의: 데이터는 이미 시드되어 있음. import/업로드 UI 불필요.

---

## 목차

1. [페이지 라우트 구조](#1-페이지-라우트-구조)
2. [단어 목록 관리 뷰](#2-단어-목록-관리-뷰)
3. [플래시카드 학습 모드 — 핵심 경험](#3-플래시카드-학습-모드--핵심-경험)
4. [간격 반복(SRS) 로직](#4-간격-반복srs-로직)
5. [비주얼 스타일](#5-비주얼-스타일)
6. [빈 상태 및 오류 상태](#6-빈-상태-및-오류-상태)
7. [디테일 및 마이크로인터랙션](#7-디테일-및-마이크로인터랙션)

---

## 1. 페이지 라우트 구조

### 1.1 라우트 목록

| 라우트 | 역할 | 설명 |
|---|---|---|
| `#/` | 홈 | 기존 home.js — Vocabulary 카드 추가 |
| `#/vocab` | 단어 목록(관리) | 97개 단어 목록, 마스터 상태, 초기화, 학습 시작 |
| `#/vocab/study` | 플래시카드 학습 | SRS 우선순위 큐 기반 학습 |
| `#/vocab/study?start=N` | 특정 단어부터 학습 | N번째(0-indexed) 단어부터 시작 (목록에서 점프) |
| `#/vocab/study?mode=unknown` | 모르는단어만 학습 | 완료 화면에서 진입 |

모든 라우트는 로그인된 `hajiyeon` 사용자 기준으로만 동작. 공유 없음.

### 1.2 API 엔드포인트 (백엔드 개발자 참고)

구현 시 필요한 추정 엔드포인트 (기존 `API.get()` 패턴 일치):

- `GET /api/vocab` — 전체 단어 반환 `[{id, word, pos, meaning, synonyms: [...]}, ...]`
- `GET /api/vocab/progress` — 현재 사용자의 학습 상태 맵 반환
- `POST /api/vocab/progress` — `{word_id, status, event}` 기록 업데이트
- `POST /api/vocab/progress/reset` — 진행 상황 전체 초기화

단, MVP 구현에서는 **진행 상태(progress)를 localStorage에만 저장**해도 무방하다 (섹션 4.3 참조). 네트워크 실패에도 학습이 멈추지 않는 것이 더 중요.

### 1.3 홈 카드 추가 (home.js)

기존 `home-grid` 내에 아래 카드를 **맨 위**에 삽입 (가장 자주 쓰는 기능).

```
┌────────────────────────────────────┐
│  📚                                │
│  Vocabulary                        │
│  TOEFL 핵심 단어 97개 플래시카드    │
│                                    │
│  [✓ 아는단어 12]  [○ 미학습 82]   │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░░  12%    │
└────────────────────────────────────┘
```

**카드 스펙:**
- 아이콘: `📚`, 클래스 `.home-card-icon`
- 타이틀: `Vocabulary`
- 설명: `TOEFL 핵심 단어 97개 플래시카드 암기`
- 배지 2개 (카드 하단):
  - 아는단어: `background: rgba(102,187,106,0.15); color: var(--success);`
  - 미학습: 기존 `.home-card-count` 스타일
- 진행률 얇은 바 (높이 4px, `border-radius: 2px`):
  - 트랙: `var(--bg-input)`
  - 채움: `var(--success)` × (knownCount / total)
- 클릭: `location.hash = '#/vocab'`

---

## 2. 단어 목록 관리 뷰

라우트: `#/vocab`

### 2.1 전체 레이아웃

```
┌──────────────────────────────────────────────┐
│  ← Vocabulary              [초기화] [▶ 학습] │
├──────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░  12 / 97 (12%)    │
│  ✓ 아는단어 12  |  ✕ 모름 3  |  ○ 미학습 82 │
├──────────────────────────────────────────────┤
│  [전체 97] [미학습 82] [아는단어 12] [모름 3]│
├──────────────────────────────────────────────┤
│  (이어서 학습: 23번째 "Decimate"부터)   [▶] │  ← 있으면 표시
├──────────────────────────────────────────────┤
│  #1   [v./n.] Burrow                         │
│       굴을 파다, 굴                 ✓ 아는   │
├──────────────────────────────────────────────┤
│  #2   [v.]    Anticipate                     │
│       예상하다, 기대하다           ○ 미학습  │
├──────────────────────────────────────────────┤
│  ...                                         │
└──────────────────────────────────────────────┘
```

### 2.2 헤더 영역

- 좌측: 뒤로가기(`←`, 기존 `.back-btn`) + 타이틀 `Vocabulary` (기존 `.header-title`)
- 우측:
  - `초기화` 버튼 — `.btn .btn-sm .btn-secondary`
  - `▶ 학습 시작` 버튼 — `.btn .btn-sm .btn-primary`
- 모바일에서는 두 버튼을 아이콘만 축약 가능하나, 초기 구현은 텍스트 유지.

### 2.3 진행률 영역

- **진행률 바**: 높이 8px, `background: var(--bg-input); border-radius: 4px;`
- 채움: `background: linear-gradient(90deg, var(--success), var(--accent));` × `(knownCount/total)%`
- `transition: width 0.5s ease;`
- 텍스트: `12 / 97 (12%)` — `font-size: 0.85rem; color: var(--text-muted);`
- 서브 텍스트: `✓ 아는단어 12  |  ✕ 모름 3  |  ○ 미학습 82`

### 2.4 필터 탭

```
[전체 97]  [미학습 82]  [아는단어 12]  [모름 3]
```

- 기존 `.mode-selector` / `.mode-btn` 클래스 그대로 사용
- 활성 탭: `.mode-btn.active`
- 각 탭의 숫자는 현재 상태 기준 실시간 계산
- 기본 활성: **전체**
- 4개가 한 줄에 안 들어가는 모바일에서는 가로 스크롤 허용 (`overflow-x: auto; scrollbar-width: none;`)

### 2.5 카테고리/그룹

**그룹 없이 플랫 리스트**. 97개는 그룹핑할 만큼 많지 않고, TOEFL 단어는 주제가 섞여 있어 카테고리가 오히려 인지부하를 만든다. 대신 pos 배지 색상으로 시각적 구분을 제공한다(섹션 5.3).

### 2.6 "이어서 학습" 섹션 (조건부)

`localStorage.toeflmate_vocab_last_index`가 존재하고 그 단어가 아직 미완료면 표시:

```
┌──────────────────────────────────────────────┐
│  🔄 이어서 학습                              │
│  23번째 "Decimate"부터 계속하기     [▶]     │
└──────────────────────────────────────────────┘
```

- 배경: `background: rgba(79,195,247,0.08); border: 1px solid rgba(79,195,247,0.2);`
- 클릭 시: `#/vocab/study?start=22` (0-indexed)

### 2.7 단어 리스트 아이템

각 단어는 클릭 가능한 카드 행:

```
┌─────────────────────────────────────────────┐
│  #1   [v./n.]  Burrow                       │
│                굴을 파다, 굴        ✓ 아는  │
└─────────────────────────────────────────────┘
```

**스펙:**
- 행 전체 `padding: 12px 14px; border-radius: var(--radius-sm); margin-bottom: 6px;`
- 배경: `var(--bg-card)` (미학습), `rgba(102,187,106,0.05)` (아는단어), `rgba(239,83,80,0.05)` (모름)
- 왼쪽 보더 3px:
  - 아는단어: `var(--success)`
  - 모름: `var(--danger)`
  - 미학습: 투명
- 인덱스 `#N`: `font-size: 0.75rem; color: var(--text-dim); font-family: var(--mono); width: 36px;`
- pos 배지: 섹션 5.3 규칙
- 영어 단어: `font-size: 1.05rem; font-weight: 600; color: var(--text);`
- 한국어 뜻: `font-size: 0.82rem; color: var(--text-muted);` — 1줄 truncate (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`)
- 우측 상태 라벨:
  - `✓ 아는` — `color: var(--success); font-size: 0.75rem;`
  - `✕ 모름` — `color: var(--danger); font-size: 0.75rem;`
  - `○ 미학습` — `color: var(--text-dim); font-size: 0.75rem;`
- hover: `border-color: var(--accent);` + `transform: translateX(2px);`
- 클릭: `location.hash = '#/vocab/study?start=N'` (N은 현재 필터된 순서가 아닌 원본 인덱스)

### 2.8 초기화 버튼 동작

- 클릭 → `confirm()` 다이얼로그: `"모든 학습 진행 상황을 초기화할까요? 아는단어/모르는단어 기록이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다."`
- 확인 시: localStorage 진행 상태 삭제 + `toeflmate_vocab_last_index` 삭제 + 페이지 리렌더
- 토스트 표시 (2초): `"초기화되었습니다"` — 화면 하단 중앙, `background: var(--bg-card); border: 1px solid var(--accent);`

---

## 3. 플래시카드 학습 모드 — 핵심 경험

라우트: `#/vocab/study` (`?start=N` 또는 `?mode=unknown` 선택)

### 3.1 전체 흐름

```
[시작] → Stage A: 영어 단어 + pos만 표시
           │ (Space/탭/↑/위 스와이프)
           ▼
         Stage B: 한국어 뜻 공개
           │
           ├── [1 / → / 오른쪽 스와이프] → known 마크 → Stage C
           └── [2 / ← / 왼쪽 스와이프]  → unknown 마크 → Stage C
           ▼
         Stage C: 유의어 3개 + 각각의 한국어 뜻
           │ (Space/→/오른쪽 스와이프)
           ▼
         다음 단어 Stage A로 반복
           ▼
         (큐 끝) → 완료 화면
```

### 3.2 공통 레이아웃

```
┌──────────────────────────────────────────────┐
│  ← 목록   Vocabulary 암기    [단어 점프 ▾]   │
├──────────────────────────────────────────────┤
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░    23 / 97         │
│  ✓ 12  |  ✕ 3  |  ○ 82                     │
├──────────────────────────────────────────────┤
│                                              │
│             [카드 영역]                      │
│                                              │
├──────────────────────────────────────────────┤
│  [← 이전]   [키보드 힌트 텍스트]   [다음 →] │
└──────────────────────────────────────────────┘
```

- 진행률 바: 높이 6px, `var(--bg-input)` 트랙 + `var(--accent)` 채움. `transition: width 0.4s ease;`
- 진행률 텍스트: `font-size: 0.85rem; color: var(--text-dim);`
- 카운터: `✓ 12 | ✕ 3 | ○ 82` — 각 색상 반영
- 하단 키보드 힌트 (데스크톱만): `Space: 뒤집기 · 1: 아는 · 2: 모름 · ←/→: 이동 · Esc: 목록` — `font-size: 0.72rem; color: var(--text-dim); text-align: center;`

### 3.3 Stage A — 단어만 표시

```
┌──────────────────────────────────────┐
│                                      │
│            [v./n.]                   │  ← pos 배지
│                                      │
│           Burrow                     │  ← 큰 영어 단어
│                                      │
│     탭하거나 Space로 뜻 확인         │  ← 힌트
│                                      │
│   ░░░░░░░░░░░░░░░░░░░░░░░░          │  ← 블러된 의미 (미리보기 방지)
│                                      │
└──────────────────────────────────────┘
```

**카드 컨테이너:**
```css
.vocab-flash-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow), 0 0 0 1px rgba(79,195,247,0.08);
  padding: 40px 32px;
  min-height: 340px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px;
  cursor: pointer;
  position: relative;
  user-select: none;
}
```

**영어 단어:**
- 데스크톱: `font-size: 2.6rem; font-weight: 700; color: var(--accent); letter-spacing: -0.01em;`
- 모바일: `font-size: 2rem;`
- 단어 길이 15자 이상(`Archaeopteryx`, `Cross-pollination`, `Grants-in-aid`, `One ten thousandths`, `Greenhouse effect`, `A good deal of`, `Be familiar with`, `Revolve around`, `Associate with`): 자동으로 `1.6rem`(데스크톱) / `1.3rem`(모바일)
- 두 단어 이상인 구(`To wage war`, `Now that` 등): `white-space: normal; text-align: center;`

**pos 배지:**
- `padding: 4px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em;`

**힌트 텍스트 (동적):**
- 모바일 감지: `'ontouchstart' in window`
- 모바일: `"탭하거나 위로 스와이프"`
- 데스크톱: `"Space / 클릭으로 뒤집기"`
- `font-size: 0.78rem; color: var(--text-dim); margin-top: 8px;`

**블러 미리보기 영역:**
- 실제 meaning 텍스트를 렌더링하되 `filter: blur(14px); opacity: 0.25; pointer-events: none; user-select: none;`
- 읽을 수는 없지만 "뭔가 있다"는 시각 신호로 뒤집기 욕구 자극

### 3.4 Stage B — 뜻 공개 + 평가

```
┌──────────────────────────────────────┐
│                                      │
│            [v./n.]                   │
│                                      │
│           Burrow                     │
│                                      │
│   ────────────────────────────      │
│                                      │
│        굴을 파다, 굴                 │  ← fade-in
│                                      │
│                                      │
├──────────────────────────────────────┤
│ ┌──────────────┐  ┌────────────────┐│
│ │ ✕ 모르는단어 │  │  ✓ 아는단어   ││
│ │     [2]      │  │      [1]       ││
│ └──────────────┘  └────────────────┘│
└──────────────────────────────────────┘
```

**전환 애니메이션 (Stage A → B):**
- 1안 (권장): CSS 3D flip
  ```css
  .vocab-flash-card-wrapper { perspective: 1200px; }
  .vocab-flash-card-inner {
    transform-style: preserve-3d;
    transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  .vocab-flash-card-inner.flipped { transform: rotateY(180deg); }
  .vocab-face-front, .vocab-face-back { backface-visibility: hidden; }
  .vocab-face-back { transform: rotateY(180deg); }
  ```
- 2안 (폴백 / `prefers-reduced-motion`): 뜻만 `opacity 0→1` + `translateY(10px→0)` fade-in (0.3s)

**한국어 뜻:**
- 데스크톱: `font-size: 1.4rem; font-weight: 500; line-height: 1.5;`
- 모바일: `font-size: 1.15rem;`
- `color: var(--text); text-align: center;`

**구분선:**
- `width: 80px; height: 1px; background: linear-gradient(90deg, transparent, #2a3a5c, transparent);`

**평가 버튼 쌍:**

| 버튼 | 레이블 | 단축키 | 클래스 |
|---|---|---|---|
| 모르는단어 | `✕  모르는단어` | `2`, `←` | `.btn .btn-danger` |
| 아는단어 | `✓  아는단어` | `1`, `→` | `.btn .btn-success` |

- 두 버튼: `display: flex; gap: 12px; margin-top: 24px;` + 각 `flex: 1;`
- 버튼 내부 키보드 힌트: `<span class="kbd-hint">[1]</span>` — `font-size: 0.7rem; opacity: 0.55; margin-left: 6px;`
- 모바일: `.kbd-hint { display: none; }`
- 좌측=모름, 우측=아는 (스와이프 방향과 일치: 왼쪽 스와이프=모름, 오른쪽 스와이프=아는)

### 3.5 Stage C — 유의어 표시

```
┌──────────────────────────────────────┐
│  [v./n.] Burrow                      │  ← 컴팩트 헤더
│  굴을 파다, 굴                       │
│                                      │
│  ─── 유의어 3개 ──────────────────   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Hole         │  구멍          │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  Tunnel       │  터널, 굴      │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  Dig          │  파다          │  │
│  └────────────────────────────────┘  │
│                                      │
│         [▶ 다음 단어]                │
└──────────────────────────────────────┘
```

**컴팩트 헤더:**
- `display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid #2a3a5c;`
- 한국어 뜻은 작게: `font-size: 0.95rem; color: var(--text-muted);`

**유의어 행:**
- 각 행: `display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; padding: 12px 16px; background: rgba(79,195,247,0.04); border-radius: 8px; margin-bottom: 8px;`
- 좌측 영어: `font-size: 0.95rem; font-weight: 600; color: var(--text);`
- 우측 한국어: `font-size: 0.85rem; color: var(--text-muted); font-style: italic;`
- 순차 등장: `animation: slide-up 0.3s ease forwards;` with `animation-delay: 0s, 0.08s, 0.16s`
  ```css
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  ```

**다음 단어 버튼:**
- `▶ 다음 단어` — `.btn .btn-primary .btn-block`
- `margin-top: 20px;`
- 마지막 단어인 경우 레이블 변경: `🎉 학습 완료 보기`

### 3.6 키보드 단축키 전체

| 키 | Stage A | Stage B | Stage C |
|---|---|---|---|
| `Space` / `Enter` | 뒤집기 | (비활성) | 다음 단어 |
| `↑` | 뒤집기 | — | — |
| `↓` | — | — | 다음 단어 |
| `1` | — | 아는단어 | — |
| `2` | — | 모르는단어 | — |
| `→` | — | 아는단어 | 다음 단어 |
| `←` | 이전 단어 | 모르는단어 | 이전 단어 |
| `Esc` | 목록으로 | 목록으로 | 목록으로 |
| `J` | 단어 점프 드롭다운 열기 | 동일 | 동일 |

**주의:** Stage B에서 `Space`/`Enter`는 **비활성화**한다 (평가 없이 넘어가는 것을 막기 위함). 평가는 반드시 1/2 또는 ←/→로.

### 3.7 모바일 스와이프 제스처

| 제스처 | Stage A | Stage B | Stage C |
|---|---|---|---|
| 탭 (카드) | 뒤집기 | (비활성) | 다음 단어 |
| ↑ 스와이프 | 뒤집기 | — | — |
| → 스와이프 | — | 아는단어 | 다음 단어 |
| ← 스와이프 | 이전 단어 | 모르는단어 | 이전 단어 |

- 스와이프 임계값: `|diff| > 50px`
- 스와이프 속도 보조 임계: `velocity > 0.3px/ms`면 거리 미달이어도 발동

**Stage B 드래그 중 시각 피드백:**
- 드래그 거리에 비례해 카드 기울기: `transform: translateX(Δx) rotate(Δx*0.05deg);`
- 오른쪽 드래그 시: `background: linear-gradient(135deg, var(--bg-card), rgba(102,187,106,0.15));` + 우상단에 큰 `✓` fade-in (`opacity: min(|Δx|/80, 1)`)
- 왼쪽 드래그 시: `background: linear-gradient(135deg, rgba(239,83,80,0.15), var(--bg-card));` + 좌상단에 큰 `✕` fade-in
- 손 뗌 + 임계 미달: 스프링 애니메이션으로 원위치 복귀 (`transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);`)
- 임계 초과: 카드가 화면 밖으로 슬라이드아웃 후 다음 카드 등장

### 3.8 단어 점프 기능 (사용자 명시 요구)

헤더 우측에 `단어 선택 ▾` 버튼. 클릭 시 드롭다운:

```
┌────────────────────────────────┐
│  [🔍 단어 검색...          ]   │
├────────────────────────────────┤
│  #1  Burrow              ✓     │
│  #2  Anticipate          ○     │
│  #3  Relocate            ✕     │
│  #4  Ounce               ○     │
│  ...                           │
│  (max-height: 320px, 스크롤)   │
└────────────────────────────────┘
```

- 컨테이너: 기존 `.settings-dropdown` 클래스 재사용 (`min-width: 280px`로 확장)
- 검색 인풋: 영어 단어 실시간 필터 (대소문자 무시, `includes()`)
- 각 행:
  - `#N` 인덱스 (mono font, `var(--text-dim)`)
  - 단어 영어
  - 우측 상태 아이콘: `✓`(아는, `var(--success)`), `✕`(모름, `var(--danger)`), `○`(미학습, `var(--text-dim)`)
- 행 hover: `background: rgba(79,195,247,0.08);`
- 클릭: 드롭다운 닫기 + 해당 단어로 점프 (현재 학습 큐를 해당 인덱스부터 재구성, Stage A로 리셋)
- 키보드:
  - `J` → 드롭다운 열기 + 검색 인풋 포커스
  - 드롭다운 내부 `↑/↓` → 행 이동, `Enter` → 선택, `Esc` → 닫기

### 3.9 완료 화면

모든 큐 단어를 돌았거나, `?mode=unknown`으로 들어온 단어 세트를 완주한 경우:

```
┌──────────────────────────────────────┐
│                                      │
│              🎉                      │
│          학습 완료!                  │
│                                      │
│   오늘 97단어 모두 다 봤어요          │
│                                      │
│  ┌──────────┬──────────┬──────────┐ │
│  │ 아는단어  │ 모르는단어 │  미학습 │ │
│  │    42    │    18    │    37    │ │
│  │  초록    │   빨강    │  회색    │ │
│  └──────────┴──────────┴──────────┘ │
│                                      │
│   [✕ 모르는단어만 다시 학습 (18)]    │
│   [↺ 처음부터 다시 학습]             │
│   [← 목록으로 돌아가기]              │
│                                      │
└──────────────────────────────────────┘
```

**숫자 타일:**
- 각 타일: `background: var(--bg-card); border-radius: 8px; padding: 16px 12px; text-align: center;`
- 숫자: `font-size: 2.2rem; font-weight: 700; font-family: var(--mono);`
- 아는: `color: var(--success)`, 모름: `color: var(--danger)`, 미학습: `color: var(--text-dim)`
- 라벨: `font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;`

**버튼:**
- `모르는단어만 다시 학습` — `.btn .btn-danger .btn-block` — 클릭: `#/vocab/study?mode=unknown`
  - 모르는단어 0개면 `disabled` + 그 위에 `"모르는 단어가 없어요 👏" (color: var(--success); font-size: 0.78rem;)`
- `처음부터 다시 학습` — `.btn .btn-secondary .btn-block`
- `목록으로 돌아가기` — 텍스트 링크 (`color: var(--text-muted); text-align: center; display: block; padding: 12px;`)

**완료 시 컨페티:** 섹션 7.4 참조.

---

## 4. 간격 반복(SRS) 로직

### 4.1 단어 상태 모델

각 단어는 다음 필드를 가진다 (localStorage 저장, 사용자별이지만 hajiyeon 전용이므로 키 분리 불필요):

```json
{
  "Burrow": {
    "status": "known",         // "unseen" | "known" | "unknown"
    "seenCount": 3,
    "knownCount": 2,
    "unknownCount": 1,
    "lastSeen": 1743800000000  // epoch ms, null if unseen
  }
}
```

**키:** 단어의 `word` 필드 원본 문자열 그대로 사용. 대소문자/공백 유지.
**저장소 키:** `toeflmate_vocab_progress`

### 4.2 학습 큐 빌드 알고리즘

`#/vocab/study` 진입 시 큐 생성:

```
function buildQueue(words, progress, mode):
  if mode == 'unknown':
    return words.filter(w => progress[w.word]?.status === 'unknown')
                .sort(byLastSeenAsc)   // 오래된 것 먼저

  // 일반 모드: 3개 티어를 이어붙인다
  tier1 = words.filter(w => progress[w.word]?.status === 'unknown')
               .sort(byUnknownCountDesc, byLastSeenAsc)
  tier2 = words.filter(w => !progress[w.word] || progress[w.word].status === 'unseen')
               // 원본 JSON/DB 순서 유지 (안정적 학습감)
  tier3 = words.filter(w => progress[w.word]?.status === 'known')
               .sort(byKnownCountAsc, byLastSeenAsc)
               .shuffleWithinSameKnownCount()

  return [...tier1, ...tier2, ...tier3]
```

**정렬 규칙 상세:**
- `tier1` (모름): `unknownCount`가 높을수록 먼저 (틀린 횟수가 많은 게 가장 급함) → 동률이면 `lastSeen`이 오래된 것 먼저
- `tier2` (미학습): 원본 순서 유지. 랜덤 셔플 옵션은 초기 구현에 불필요.
- `tier3` (아는): `knownCount`가 낮을수록 먼저 (아직 덜 검증됨), 동률 내에서는 셔플

**`?start=N` 지정 시:** 일반 큐를 빌드하되, 인덱스 N에 해당하는 단어가 큐 앞으로 오도록 회전 (`queue = [...queue.slice(N), ...queue.slice(0, N)]`).

### 4.3 상태 전이 규칙

- Stage B `아는단어` 클릭/스와이프:
  - `status = 'known'`
  - `knownCount++`
  - `seenCount++`
  - `lastSeen = Date.now()`
  - localStorage 즉시 저장
- Stage B `모르는단어` 클릭/스와이프:
  - `status = 'unknown'`
  - `unknownCount++`
  - `seenCount++`
  - `lastSeen = Date.now()`
  - localStorage 즉시 저장
- 점프로 단어에 도달해도 Stage B 평가 전까지는 변경 없음
- 마지막 학습 인덱스 저장: Stage A 진입 시마다 `toeflmate_vocab_last_index = queueIndex` 갱신

### 4.4 초기화

`초기화` 버튼 → `localStorage.removeItem('toeflmate_vocab_progress')` + `localStorage.removeItem('toeflmate_vocab_last_index')`

### 4.5 단어 데이터 로드

- 컴포넌트 진입 시 `API.get('/api/vocab')` 호출 (또는 JSON 직접 로드)
- 응답 캐시: `sessionStorage.toeflmate_vocab_cache` (네트워크 실패 시 폴백)
- 로드 실패 + 캐시도 없음 → 에러 화면 (섹션 6.1)

---

## 5. 비주얼 스타일

모든 스타일은 기존 `app.css`의 CSS 변수만 사용. 새 변수 추가 금지.

### 5.1 사용 변수 체크리스트

| 용도 | 변수 |
|---|---|
| 페이지 배경 | `--bg` |
| 카드 배경 | `--bg-card` |
| 인풋/배지 배경 | `--bg-input` |
| 주 강조색 | `--accent` (#4fc3f7) |
| 본문 텍스트 | `--text` |
| 보조 텍스트 | `--text-muted` |
| 희미한 텍스트 | `--text-dim` |
| 성공 / 아는단어 | `--success` (#66bb6a) |
| 위험 / 모르는단어 | `--danger` (#ef5350) |
| 경고 | `--warning` (#ffa726) |
| 라디우스 | `--radius` (12px), `--radius-sm` (8px) |
| 쉐도우 | `--shadow` |
| 폰트 | `--font`, `--mono` |

### 5.2 반응형 폰트 크기

| 요소 | 데스크톱 (≥481px) | 모바일 (≤480px) |
|---|---|---|
| 영어 단어 (일반) | 2.6rem | 2rem |
| 영어 단어 (15자+) | 1.6rem | 1.3rem |
| 한국어 뜻 (Stage B) | 1.4rem | 1.15rem |
| pos 배지 | 0.8rem | 0.75rem |
| 유의어 영어 | 0.95rem | 0.88rem |
| 유의어 한국어 | 0.85rem | 0.78rem |
| 힌트 텍스트 | 0.78rem | 0.72rem |
| 진행률 텍스트 | 0.85rem | 0.78rem |

### 5.3 품사별 색상 코딩

| pos 문자열 | 클래스 | 배경 | 텍스트 |
|---|---|---|---|
| `n.` | `pos-noun` | `rgba(79,195,247,0.15)` | `var(--accent)` |
| `v.` | `pos-verb` | `rgba(102,187,106,0.15)` | `var(--success)` |
| `adj.` | `pos-adj` | `rgba(124,77,255,0.18)` | `#b39ddb` |
| `adv.` | `pos-adv` | `rgba(255,167,38,0.15)` | `var(--warning)` |
| `phr.` | `pos-phrase` | `rgba(239,83,80,0.12)` | `#ef9a9a` |
| `conj.` | `pos-conj` | `rgba(255,167,38,0.12)` | `var(--warning)` |
| 복합 (`v./n.`, `n./v.`, `adj./v.`, `n./adj.` 등) | `pos-compound` | `rgba(124,77,255,0.1)` | `var(--text-muted)` |

**판별 함수:**
```javascript
function posClass(pos) {
  if (!pos) return 'pos-compound';
  if (pos.includes('/')) return 'pos-compound';
  const p = pos.toLowerCase().replace('.', '').trim();
  if (p === 'n') return 'pos-noun';
  if (p === 'v') return 'pos-verb';
  if (p === 'adj') return 'pos-adj';
  if (p === 'adv') return 'pos-adv';
  if (p === 'phr') return 'pos-phrase';
  if (p === 'conj') return 'pos-conj';
  return 'pos-compound';
}
```

### 5.4 카드 시각 속성 총정리

```css
.vocab-flash-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(79, 195, 247, 0.08);
  padding: 40px 32px;
  min-height: 340px;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

@media (max-width: 480px) {
  .vocab-flash-card {
    padding: 32px 20px;
    min-height: 300px;
  }
}

.vocab-flash-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(79, 195, 247, 0.2);
}

.vocab-flash-card:active {
  transform: translateY(-1px) scale(0.995);
}
```

### 5.5 목록 아이템 스타일

```css
.vocab-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}
.vocab-list-item:hover {
  border-color: var(--accent);
  transform: translateX(2px);
}
.vocab-list-item.known {
  background: rgba(102, 187, 106, 0.05);
  border-left-color: var(--success);
}
.vocab-list-item.unknown {
  background: rgba(239, 83, 80, 0.05);
  border-left-color: var(--danger);
}
```

---

## 6. 빈 상태 및 오류 상태

### 6.1 단어 데이터 로드 실패 (네트워크 오류)

```
┌────────────────────────────────────┐
│              ⚠️                    │
│  단어 데이터를 불러올 수 없어요      │
│                                    │
│  인터넷 연결을 확인하거나 잠시 후   │
│  다시 시도해주세요.                 │
│                                    │
│    [🔄 다시 시도]  [홈으로]         │
└────────────────────────────────────┘
```

- 아이콘: `⚠️ (2.5rem)`
- 메시지: `color: var(--text-muted);`
- 다시 시도 버튼: `.btn .btn-primary`
- 홈으로 버튼: `.btn .btn-secondary`
- 캐시된 데이터가 있다면: `[캐시 데이터로 오프라인 학습]` 추가 버튼

### 6.2 0개 단어 (DB 빈 경우, 정상적으로는 발생 안 함)

```
┌────────────────────────────────────┐
│              📭                    │
│      등록된 단어가 없습니다         │
│                                    │
│  관리자에게 문의하거나 나중에 다시  │
│  방문해주세요.                     │
│                                    │
│         [홈으로 돌아가기]           │
└────────────────────────────────────┘
```

### 6.3 모든 단어 마스터 완료 (진행률 100%)

`#/vocab/study` 진입 시 모든 단어가 `known`이면:

```
┌────────────────────────────────────┐
│              🏆                    │
│     97개 단어 모두 완료!            │
│                                    │
│  모든 단어를 마스터했어요.          │
│  복습하거나 초기화하고 다시 시작하  │
│  세요.                             │
│                                    │
│   [🔄 복습 모드로 시작]             │
│   [↺ 진행 상황 초기화]              │
│   [← 목록 보기]                    │
└────────────────────────────────────┘
```

- 복습 모드: tier3만 순회 (가장 오래된 것부터)
- 초기화: 섹션 2.8의 확인 다이얼로그 재사용

### 6.4 모르는단어 0개 상태에서 `?mode=unknown`

리다이렉트 처리: `#/vocab` + 토스트 `"모르는 단어가 없어요 👏"`

### 6.5 localStorage 접근 실패 (프라이빗 모드 등)

- try/catch로 감싸고 실패 시: 메모리 내 객체로 폴백
- 상단 경고 배너: `"⚠️ 브라우저 저장소 접근 불가 — 진행 상황이 저장되지 않습니다"` — `background: rgba(255,167,38,0.12); color: var(--warning); padding: 10px; border-radius: 8px;`

---

## 7. 디테일 및 마이크로인터랙션

### 7.1 버튼 탭 피드백

```css
.btn:active { transform: scale(0.96); transition: transform 0.08s ease; }
```

평가 버튼 추가 효과 — 클릭 순간 200ms 펄스:
- 아는단어: `box-shadow: 0 0 0 4px rgba(102, 187, 106, 0.4);` 순간 번쩍임
- 모르는단어: `box-shadow: 0 0 0 4px rgba(239, 83, 80, 0.4);` 순간 번쩍임

```css
@keyframes pulse-success {
  0% { box-shadow: 0 0 0 0 rgba(102,187,106, 0.6); }
  100% { box-shadow: 0 0 0 12px rgba(102,187,106, 0); }
}
.btn-success.pulsing { animation: pulse-success 0.4s ease-out; }
```

### 7.2 카드 뒤집기

- 기본: CSS 3D flip (섹션 3.4 1안)
- `@media (prefers-reduced-motion: reduce)`: fade 폴백
  ```css
  @media (prefers-reduced-motion: reduce) {
    .vocab-flash-card-inner { transition: opacity 0.2s; }
  }
  ```

### 7.3 진행률 바 애니메이션

`transition: width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);`

### 7.4 완료 화면 컨페티

**1안 (권장):** `canvas-confetti` npm 라이브러리 동적 로드 (CDN 가능)
- 지속: 2.5초
- 컬러: `['#4fc3f7', '#66bb6a', '#ffa726', '#7c4dff', '#ef5350']`
- 발사 위치: 화면 좌/우 하단에서 대각선 위로 2회 발사
- 기본값: **활성화**

**2안 (폴백, 라이브러리 추가 불가):**
- 🎉 이모지 bounce-in 애니메이션 (`font-size: 3.5rem`)
```css
@keyframes bounce-in {
  0%   { transform: scale(0) translateY(-40px); opacity: 0; }
  60%  { transform: scale(1.25) translateY(0); opacity: 1; }
  100% { transform: scale(1) translateY(0); }
}
.completion-emoji { animation: bounce-in 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
```
- 숫자 타일들은 순차적으로 count-up 애니메이션 (0 → 실제값, 0.6초)

### 7.5 사운드 (선택 사항, 기본 OFF)

- 아는단어: 880Hz 사인파 0.15초 (밝은 딩)
- 모르는단어: 220Hz 사인파 0.2초 (둔한 썸)
- 완료: C-E-G 화음 아르페지오
- 토글: 헤더 아이콘 버튼 `🔇`/`🔊`, 상태는 `localStorage.toeflmate_sound`
- Web Audio API로 외부 파일 없이 생성

```javascript
function playSound(freq, duration) {
  if (localStorage.toeflmate_sound !== 'on') return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(); osc.stop(ctx.currentTime + duration);
}
```

### 7.6 세션 자동 저장

- Stage A 진입 시마다 `toeflmate_vocab_last_index = currentQueueIndex` 저장
- `beforeunload` 이벤트에서도 저장 백업
- `#/vocab` 진입 시 해당 값이 있으면 "이어서 학습" 섹션 표시 (섹션 2.6)

### 7.7 토스트 알림

짧은 알림 (초기화, 에러 등):
```css
.toast {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 12px 20px;
  font-size: 0.88rem;
  box-shadow: var(--shadow);
  z-index: 1000;
  animation: toast-in 0.3s ease, toast-out 0.3s ease 1.7s forwards;
}
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 16px); } }
@keyframes toast-out { to   { opacity: 0; transform: translate(-50%, 16px); } }
```

### 7.8 카드 hover 글로우 (데스크톱)

Stage A 카드 hover 시 영어 단어 주변에 미묘한 accent 글로우:
```css
.vocab-flash-card:hover .vocab-word {
  text-shadow: 0 0 24px rgba(79, 195, 247, 0.3);
  transition: text-shadow 0.3s;
}
```

### 7.9 키보드 포커스 접근성

- 모든 버튼에 `:focus-visible` 스타일:
  ```css
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  ```
- 카드 자체도 `tabindex="0"`로 키보드 포커스 가능

### 7.10 네트워크 지연 시 로딩 스켈레톤

`#/vocab` 진입 시 `GET /api/vocab` 응답 전:
```
┌──────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░      │  ← 진행률 바 스켈레톤
│  ░░░░░░░░░░░░░                   │
│                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░      │  ← 필터 탭
│                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │  ← 아이템
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
└──────────────────────────────────┘
```
- 스켈레톤 배경: `background: linear-gradient(90deg, var(--bg-card) 0%, var(--bg-input) 50%, var(--bg-card) 100%); background-size: 200% 100%; animation: shimmer 1.4s infinite;`

---

## 부록 A: 주요 화면 ASCII 와이어프레임

### A.1 홈 — Vocabulary 카드 (기존 home-grid 맨 위)

```
┌──────────────────────────────────────┐
│  📚                                  │
│  Vocabulary                          │
│  TOEFL 핵심 단어 97개 플래시카드     │
│                                      │
│  [✓ 아는 12]  [○ 미학습 82]         │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░░  12%       │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│  🎙️  Speaking Interview  (기존)       │
└──────────────────────────────────────┘
```

### A.2 단어 목록 뷰

```
← Vocabulary                [초기화] [▶ 학습]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░   12 / 97 (12%)
✓ 아는 12  |  ✕ 모름 3  |  ○ 미학습 82
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[전체 97] [미학습 82] [아는 12] [모름 3]

🔄 이어서 학습: 23번째 "Decimate"부터    [▶]

#1  [v./n.] Burrow                 ✓ 아는
            굴을 파다, 굴
#2  [v.]    Anticipate             ○ 미학습
            예상하다, 기대하다
#3  [v.]    Relocate               ✕ 모름
            이전하다
...
```

### A.3 학습 Stage A

```
← 목록   Vocabulary 암기   [단어 선택 ▾]
━━━━━━━━━━━━━━━━━━━━━━  23 / 97
✓ 12  |  ✕ 3  |  ○ 82

┌────────────────────────────────────┐
│                                    │
│            [v./n.]                 │
│                                    │
│           Burrow                   │
│                                    │
│    탭하거나 Space로 뜻 확인         │
│                                    │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░        │
│                                    │
└────────────────────────────────────┘

 Space: 뒤집기 · 1: 아는 · 2: 모름 · Esc: 목록
```

### A.4 학습 Stage B

```
← 목록   Vocabulary 암기   [단어 선택 ▾]
━━━━━━━━━━━━━━━━━━━━━━  23 / 97
✓ 12  |  ✕ 3  |  ○ 82

┌────────────────────────────────────┐
│                                    │
│            [v./n.]                 │
│                                    │
│           Burrow                   │
│                                    │
│     ──────────────────             │
│                                    │
│        굴을 파다, 굴               │
│                                    │
└────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐
│  ✕ 모르는단어 [2]│  │  ✓ 아는단어  [1] │
└──────────────────┘  └──────────────────┘
```

### A.5 학습 Stage C

```
← 목록   Vocabulary 암기   [단어 선택 ▾]
━━━━━━━━━━━━━━━━━━━━━━  23 / 97

┌────────────────────────────────────┐
│  [v./n.]  Burrow                   │
│  굴을 파다, 굴                     │
│  ─────────────────────────         │
│  ─── 유의어 3개 ─────────────      │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Hole        │  구멍         │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │  Tunnel      │  터널, 굴     │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │  Dig         │  파다         │  │
│  └──────────────────────────────┘  │
│                                    │
│        [▶ 다음 단어]               │
└────────────────────────────────────┘
```

### A.6 완료 화면

```
┌────────────────────────────────────┐
│                                    │
│              🎉                    │
│          학습 완료!                │
│                                    │
│    97단어를 모두 다 봤어요          │
│                                    │
│  ┌────────┬────────┬────────┐     │
│  │아는단어│모르는단어│ 미학습 │     │
│  │   42   │   18   │   37   │     │
│  └────────┴────────┴────────┘     │
│                                    │
│  [✕ 모르는단어만 다시 학습 (18)]   │
│  [↺ 처음부터 다시 학습]            │
│       목록으로 돌아가기             │
│                                    │
└────────────────────────────────────┘
         🎊 confetti 🎊
```

---

## 부록 B: 구현 체크리스트 (개발자용)

### B.1 신규 파일
- `static/js/pages/vocab-list.js` — 단어 목록 뷰
- `static/js/pages/vocab-study.js` — 플래시카드 학습 뷰
- `static/js/lib/vocab-progress.js` — localStorage 진행 상태 관리 모듈
- `static/js/lib/vocab-queue.js` — SRS 큐 빌더

### B.2 수정 파일
- `static/js/pages/home.js` — Vocabulary 카드 추가 (맨 위)
- `static/js/router.js` (또는 라우팅 엔트리) — `#/vocab`, `#/vocab/study` 라우트 등록
- `static/css/app.css` — 하단에 "=== Vocab Flashcard ===" 섹션 추가 (새 변수 없음)

### B.3 CSS 추가 클래스 (app.css 하단에 append)
- `.vocab-flash-card-wrapper`, `.vocab-flash-card-inner`, `.vocab-face-front`, `.vocab-face-back`
- `.vocab-word-large`
- `.pos-noun`, `.pos-verb`, `.pos-adj`, `.pos-adv`, `.pos-phrase`, `.pos-conj`, `.pos-compound`
- `.vocab-list-item`, `.vocab-list-item.known`, `.vocab-list-item.unknown`
- `.vocab-syn-row`
- `.toast`, `.toast-in`, `.toast-out`
- `.kbd-hint`
- `@keyframes slide-up`, `pulse-success`, `pulse-danger`, `bounce-in`, `shimmer`

### B.4 테스트 시나리오
1. 신규 사용자: 전체 97단어 미학습 → 학습 시작 → 처음 5개 단어를 3개 아는/2개 모름 평가 → localStorage 확인
2. 이어서 학습: 중간에 탭 닫고 재방문 → "이어서 학습" 섹션 노출 확인
3. 단어 점프: 목록에서 50번째 단어 클릭 → Stage A부터 해당 단어로 시작 확인
4. 모르는단어 모드: 완료 화면에서 "모르는단어만" 클릭 → 큐에 unknown만 있는지 확인
5. 초기화: 초기화 → confirm → 모든 상태 `unseen`으로 복귀 확인
6. 키보드 전용 조작: 마우스 없이 목록 → 학습 → 완료까지 전체 플로우 가능 확인
7. 모바일 스와이프: Stage B에서 좌/우 스와이프로 평가 가능 확인
8. 오프라인: 네트워크 끄고 재방문 → sessionStorage 캐시로 학습 가능 확인

---

*이 스펙에 관해 궁금한 점은 하지연에게 확인. 구현 중 발견한 UX 이슈는 스펙에 역으로 피드백 부탁.*

---

## [MOBILE REVISION 2026-04-06]

> **목적:** 기존 스펙은 데스크톱 키보드 우선(Space/J/Esc/화살표)으로 작성되었으나, 실제 사용은 **iPhone PWA(375–430px)** 위주로 확인됨. 이 섹션은 위쪽 섹션 3·5·7의 관련 부분을 **모바일 퍼스트**로 덮어쓰는 최종 권위(override) 문서다. 충돌 시 이 섹션이 우선한다.
>
> **범위:** `static/js/pages/vocab-study.js`, `static/js/pages/vocab.js`, `static/js/lib/vocab-utils.js`, `static/css/app.css`의 Vocab Flashcard 섹션. 데스크톱 키보드 단축키는 **JS 로직에서는 유지**하되, **UI 텍스트에서는 완전히 제거**한다.

### M.1 디자인 원칙 (모바일 퍼스트)

1. **Primary viewport**: 375–430px (iPhone SE ~ 15 Pro Max). Desktop ≥768px는 fluid max-width로 대응.
2. **Thumb zone**: 평가/주요 액션은 **화면 하단 2/3 영역**에 위치. 상단은 정보 전용.
3. **No hover**: `:hover` 상태는 데스크톱(`@media (hover: hover) and (pointer: fine)`)으로만 격리. 모바일에서는 `:active`만 사용.
4. **No keyboard text**: "Space", "Enter", "J", "Esc", "←/→", "1/2", "[1]/[2]" 등 모든 키보드 지칭 문자열을 **렌더링 DOM에서 제거**. 단축키 동작은 유지.
5. **Tap target ≥48×48px**: 모든 상호작용 요소는 iOS HIG 44pt / Material 48dp 이상.
6. **Safe area**: `env(safe-area-inset-top/bottom/left/right)`을 헤더/바텀바/바텀시트에 반드시 적용.
7. **Haptic via CSS**: 진동 API 대신 짧은 CSS 트랜스폼(scale/translate)으로 "탭이 먹혔다"는 감각 제공.

### M.2 인터랙션 모델 — 터치 1차, 키보드 2차

**전면 재설계된 Stage 전환 표** (섹션 3.6, 3.7을 대체):

| Stage | 주 제스처 (터치) | 보조 제스처 (터치) | 데스크톱 키보드 (숨김) |
|---|---|---|---|
| **A** (단어만) | 카드 **어디든 탭** → Stage B | ↑ 스와이프 → B | `Space`/`Enter`/`↑` → B, `←` → 이전 |
| **B** (뜻+평가) | **하단 버튼 탭**: ✕ 모름 / ✓ 아는 | **좌 스와이프**=모름, **우 스와이프**=아는 | `1`/`→`=아는, `2`/`←`=모름 |
| **C** (유의어) | **하단 "다음 단어" 버튼 탭** | 좌 스와이프 → 다음, 우 스와이프 → 이전 | `Space`/`Enter`/`→`/`↓` = 다음 |
| 전 Stage 공통 | 헤더 **← 뒤로** 탭 → 목록 | 헤더 **점프** 탭 → 바텀시트 | `Esc` = 목록, `J` = 점프 |

- `Space`/`Enter`/`J`/`Esc` 등은 **JS 이벤트 리스너로만 존재**하고, 어떤 DOM 텍스트에도 노출되지 않는다.
- 모바일(`'ontouchstart' in window || matchMedia('(pointer: coarse)').matches`) 감지 시 키보드 이벤트 리스너는 그대로 두되, **힌트 문자열은 터치용으로 강제**한다.

### M.3 UI 텍스트 교체표 (Before → After)

**모든 변경은 렌더링되는 문자열 기준. JS 파일 내 리터럴을 교체한다.**

| 위치 | Before (현재) | After (모바일) | 비고 |
|---|---|---|---|
| `renderStageA()` 힌트 | `"Space / 클릭으로 뒤집기"` (데스크톱) / `"탭하거나 위로 스와이프"` (모바일) | `"탭하여 뜻 보기"` (모바일/데스크톱 공통) | 조건 분기 제거, 문자열 단일화 |
| `renderStageA()` 하단 `vs-kb-hint` | `"Space: 뒤집기 · ← 이전 · Esc: 목록 · J: 점프"` | **빈 문자열 `""`** (완전 제거, 컨테이너도 `display:none` 또는 미렌더) | 힌트 영역 자체 삭제 |
| `renderStageB()` 버튼 | `✕ 모르는단어<span class="kbd-hint">[2]</span>` / `✓ 아는단어<span class="kbd-hint">[1]</span>` | `✕ 모름` / `✓ 아는` (kbd-hint span 완전 제거) | 레이블 짧게, `.kbd-hint` 클래스 DOM에서 제거 |
| `renderStageB()` 하단 힌트 | `"1: 아는 · 2: 모름 · ←/→: 평가 · Esc: 목록"` | `"← 모름 ·  아는 →"` (스와이프 가이드, 0.7rem, 첫 카드 이후 자동 fade 옵션) | 섹션 M.7 first-time hint 참조 |
| `renderStageC()` 하단 힌트 | `"Space/Enter/→: 다음 · ← 이전 · Esc: 목록"` | **빈 문자열** (제거) | 하단 "다음 단어" 버튼이 CTA |
| `renderStageC()` 다음 버튼 | `▶ 다음 단어` (`.btn .btn-primary`) | `다음 단어 →` (`.btn .btn-primary .btn-block .vs-cta-next`) | 풀폭, 56px 높이, 섹션 M.4 참조 |
| 헤더 점프 버튼 | `"단어 점프 ▾"` | `"점프"` (아이콘 생략 or `⋮`/`☰` 작게) | 바텀시트 트리거 |
| 헤더 사운드 버튼 `#vs-sound` | 헤더 상단에 `🔊/🔇` 아이콘 버튼 | **헤더에서 제거**. 점프 바텀시트 하단 "설정" 영역 또는 오버플로우 메뉴로 이동 | 섹션 M.8 참조 |
| 완료 화면 안내 | (기존) | 변경 없음 (이모지+한국어이므로 문제없음) | — |

> **dev agent 액션**: 위 표의 **After** 컬럼이 곧 최종 문자열. 조건부 `isTouch ? A : B` 형태의 분기는 전부 제거하고 단일 문자열로 통일한다.

### M.4 바텀 내비 바 사양 (신규)

Stage A/B/C 모두에서 카드 아래 **fixed-like** (스크롤에는 따라옴, 하지만 시각적으로 하단 고정처럼 보이도록 카드와 바텀바가 같은 스크롤 컨테이너 내부에 놓임) 바텀 컨트롤 바를 둔다.

```
Stage A:
┌─────────────────────────────────┐
│  ← 이전   [ 탭하여 뜻 보기 ]   점프  │   ← 보조 (아이콘 + 작은 레이블)
└─────────────────────────────────┘
         (메인 액션 = 카드 탭)

Stage B (버튼이 메인):
┌─────────────────────────────────┐
│  ┌─────────┐   ┌─────────┐     │
│  │ ✕  모름 │   │ ✓  아는 │     │
│  └─────────┘   └─────────┘     │
│       ← 모름 ·  아는 →          │  ← 스와이프 힌트 (first-card만)
└─────────────────────────────────┘

Stage C:
┌─────────────────────────────────┐
│  ┌───────────────────────────┐  │
│  │     다음 단어  →          │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**치수 (모바일 ≤480px):**

| 요소 | 값 |
|---|---|
| 바텀바 컨테이너 | `padding: 12px 16px calc(12px + env(safe-area-inset-bottom)) 16px;` |
| 평가 버튼 높이 | `min-height: 56px;` |
| 평가 버튼 폰트 | `font-size: 1.05rem; font-weight: 600;` |
| 평가 버튼 간격 | `gap: 12px;` (좌우 두 개, 각 `flex: 1;`) |
| "다음 단어" 버튼 | `min-height: 56px; width: 100%; font-size: 1.05rem;` |
| Stage A 하단 보조 | 높이 `44px`, 좌(이전)/우(점프)는 아이콘+텍스트 `0.78rem`, 중앙은 안내 텍스트 `0.85rem` |
| 탭 타겟 최소 | `48×48px` (투명 padding 포함 가능) |

**데스크톱 ≥768px**: 버튼 `min-height: 48px`로 축소, `max-width: 560px` centered.

### M.5 스와이프 제스처 사양 (섹션 3.7 대체)

**적용 Stage**: A(이전만), B(평가), C(이동). 세로 스와이프(↑/↓)는 **제거**한다 (iOS에서 스크롤과 충돌).

| 제스처 | Stage A | Stage B | Stage C |
|---|---|---|---|
| 카드 **탭** | → Stage B | (비활성, 평가 강제) | → 다음 단어 |
| **좌 스와이프** | 이전 단어 | **모름** 평가 | 다음 단어 |
| **우 스와이프** | (비활성 or 이전과 동일) | **아는** 평가 | 이전 단어 |

**임계값:**
- 거리: `|Δx| > 60px` (기존 50 → 60, 오탐 감소)
- 속도: `|vx| > 0.35 px/ms`면 거리 미달이어도 발동
- 세로 오차 방지: `|Δy| > |Δx| * 1.2`면 **스와이프 취소**(스크롤로 간주)
- 터치 시작에서 100ms 내 움직임 없으면 long-press로 간주해 제스처 무시

**드래그 중 시각 피드백 (Stage B):**
- `transform: translateX(Δx) rotate(calc(Δx * 0.04deg));` (기존 0.05 → 0.04, 미세 완화)
- 좌측 드래그: 카드 배경 `linear-gradient(135deg, rgba(239,83,80,0.18), var(--bg-card))` + 좌상단 `✕` (`opacity: min(|Δx|/70, 1)`, `font-size: 3rem`)
- 우측 드래그: `linear-gradient(135deg, var(--bg-card), rgba(102,187,106,0.18))` + 우상단 `✓`
- 손 뗌 + 임계 미달: `transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);` 스프링 복귀
- 임계 초과: `transform: translateX(±120vw) rotate(±20deg); opacity: 0;` 0.3s 후 다음 카드 등장

**제스처 등록:** `touchstart`/`touchmove`/`touchend` + `{passive: true}`(move는 가로로 확정되면 `passive: false`로 전환, 또는 `touch-action: pan-y;`로 세로만 브라우저에 맡김).

### M.6 햅틱(CSS) 피드백

진동 API는 사용하지 않는다. 대신 아래 CSS 마이크로 애니메이션:

```css
/* 카드 탭 */
.vocab-flash-card:active { transform: scale(0.985); transition: transform 80ms ease-out; }

/* 평가 버튼 탭 */
.vs-rate-btn:active { transform: scale(0.96); }
.vs-rate-btn.pulsing-success { animation: vs-pulse-ok 380ms ease-out; }
.vs-rate-btn.pulsing-danger  { animation: vs-pulse-no 380ms ease-out; }

@keyframes vs-pulse-ok {
  0%   { box-shadow: 0 0 0 0 rgba(102,187,106,0.55); }
  100% { box-shadow: 0 0 0 14px rgba(102,187,106,0); }
}
@keyframes vs-pulse-no {
  0%   { box-shadow: 0 0 0 0 rgba(239,83,80,0.55); }
  100% { box-shadow: 0 0 0 14px rgba(239,83,80,0); }
}

/* Stage 전환 */
.vs-stage-enter { animation: vs-stage-in 280ms cubic-bezier(0.25,0.46,0.45,0.94) both; }
@keyframes vs-stage-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .vs-stage-enter, .vs-rate-btn.pulsing-success, .vs-rate-btn.pulsing-danger { animation: none; }
  .vocab-flash-card:active { transform: none; }
}
```

### M.7 최초 진입 제스처 힌트 (first-card hint)

사용자가 학습 세션에서 **첫 카드의 Stage B에 처음 도달**했을 때만 노출되는 애니메이션 힌트.

**트리거:**
- `localStorage.toeflmate_vocab_swipe_hint_seen !== '1'`
- Stage B 렌더 시점에 한 번만

**시각 요소 (카드 내부 오버레이, pointer-events: none):**
```
     ←                           →
  ✕ 모름                      아는 ✓
        (좌우 화살표가 약하게 흔들림)
```

**CSS/애니메이션:**
```css
.vs-swipe-hint {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px;
  font-size: 0.9rem; color: var(--text-muted);
  pointer-events: none;
  animation: vs-hint-in 400ms ease-out 200ms both,
             vs-hint-sway 1.6s ease-in-out 600ms 2;
}
.vs-swipe-hint.fading { animation: vs-hint-out 300ms ease-out forwards; }

@keyframes vs-hint-in  { from { opacity: 0; } to { opacity: 0.9; } }
@keyframes vs-hint-out { to { opacity: 0; } }
@keyframes vs-hint-sway {
  0%,100% { transform: translateX(0); }
  50%     { transform: translateX(6px); }
}
```

**해제 조건:** 어떤 평가(탭/스와이프)든 **1회 발생 시** `.fading` 클래스 추가 → 300ms 후 DOM 제거 → `localStorage.toeflmate_vocab_swipe_hint_seen = '1'` 저장. 같은 단말에서 다시 표시되지 않음.

> 리셋: 설정에서 "초기화" 시 이 키도 함께 삭제해 다시 튜토리얼 볼 수 있게 한다.

### M.8 사운드 토글 이동 & 점프 바텀시트

**사운드 토글:**
- 헤더의 `#vs-sound` 버튼 **제거**.
- 대신 점프 바텀시트 상단 또는 하단에 `설정` 섹션: `[🔊 발음 자동 재생  ●────○ ]` 토글 스위치.
- 기존 `loadSoundEnabled()`/저장 로직은 그대로 사용, 위치만 이동.

**점프 바텀시트 (iOS 스타일):**
- 기존 `.settings-dropdown` 대신 모바일에서는 바텀시트로 전환.
- 구조:
  ```
  ┌──────────────────────────────┐
  │          ━━━━                │  ← drag handle
  │  단어 점프                    │
  │  ┌─────────────────────────┐ │
  │  │ 🔍 단어 검색...          │ │
  │  └─────────────────────────┘ │
  │  #1  Burrow          ✓       │
  │  #2  Anticipate      ○       │
  │   ...  (스크롤)              │
  │  ─────────────────────────   │
  │  🔊 발음 자동 재생   [●──]    │  ← 설정 섹션
  └──────────────────────────────┘
          (+ safe-area-inset-bottom)
  ```
- CSS:
  ```css
  .vs-sheet {
    position: fixed; left: 0; right: 0; bottom: 0;
    background: var(--bg-card);
    border-radius: 16px 16px 0 0;
    max-height: 80vh; overflow-y: auto;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
    transform: translateY(100%);
    transition: transform 280ms cubic-bezier(0.32,0.72,0,1);
    box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
    z-index: 100;
  }
  .vs-sheet.open { transform: translateY(0); }
  .vs-sheet-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    opacity: 0; pointer-events: none;
    transition: opacity 200ms ease;
    z-index: 99;
  }
  .vs-sheet-backdrop.open { opacity: 1; pointer-events: auto; }
  .vs-sheet-handle {
    width: 40px; height: 4px; border-radius: 2px;
    background: var(--text-dim); opacity: 0.4;
    margin: 0 auto 12px;
  }
  ```
- 닫기: 백드롭 탭, 핸들 아래로 스와이프(`touchmove` Δy>80), 또는 Esc 키.
- 데스크톱(≥768px): 기존 `.settings-dropdown` 유지(팝오버).

### M.9 헤더 사양 (수정)

```
모바일:
┌──────────────────────────────────────────┐
│  ←      Vocabulary           점프       │
│        ▓▓▓▓▓░░░░   23 / 97              │
└──────────────────────────────────────────┘
```

- 상단 `padding-top: calc(8px + env(safe-area-inset-top));`
- 좌측 ← 아이콘 버튼: 48×48, `aria-label="목록으로"` (텍스트 "목록으로" 병기 없음, 아이콘만)
- 중앙 타이틀: `font-size: 1rem; font-weight: 600;`
- 우측 "점프" 버튼: `font-size: 0.85rem; padding: 8px 14px; min-height: 40px;`
- 진행률 바: 기존 유지, 카운터 `✓ 12 | ✕ 3 | ○ 82`는 모바일에서 `font-size: 0.72rem;`로 축소
- **사운드 아이콘 없음**

### M.10 진행률 인디케이터

- 얇고 은은하게 유지: 높이 `4px` (모바일), `6px` (데스크톱).
- 카운터 배지(`✓/✕/○`)는 헤더 진행률 바 바로 아래, `gap: 10px;` 한 줄.
- 100% 도달 시 진행률 바 `background: var(--success);` + 살짝 글로우 애니메이션(섹션 7.3 재사용).

### M.11 CSS 클래스 변경 요약 (dev agent 체크리스트)

**제거(or DOM에서 사용 중단):**
- `.kbd-hint` — Stage B 버튼 내부의 `[1]/[2]` 배지. JS에서 해당 `<span>` 생성 코드 삭제.
- `.vs-kb-hint` 컨테이너의 Stage A/C용 힌트 문자열(빈 문자열 전달 또는 조건부 미렌더). 클래스 자체는 Stage B의 스와이프 힌트용으로 재활용 가능.
- `.vocab-flash-card:hover` 스타일 — `@media (hover: hover) and (pointer: fine)`로 감쌀 것.

**신규:**
- `.vs-rate-btn` — Stage B 평가 버튼 공통 클래스 (`min-height: 56px`).
- `.vs-cta-next` — Stage C 풀폭 다음 버튼.
- `.vs-bottom-bar` — 바텀 내비 바 공통 컨테이너 (`padding-bottom: calc(12px + env(safe-area-inset-bottom))`).
- `.vs-swipe-hint`, `.vs-swipe-hint.fading` — 최초 진입 힌트.
- `.vs-stage-enter` — Stage 전환 애니메이션 트리거.
- `.vs-sheet`, `.vs-sheet.open`, `.vs-sheet-backdrop`, `.vs-sheet-handle` — 바텀시트.
- `.vs-header-mobile` — safe-area 인셋 포함 헤더.
- `.vs-progress-bar` (기존 진행률 바를 이 클래스로 분리하고 높이 반응형 처리).

**수정:**
- `.vocab-flash-card` — `cursor: pointer`는 유지하되 `:hover`는 hover 미디어로 격리. `touch-action: pan-y;` 추가(세로 스크롤은 허용, 가로 스와이프만 JS 처리).
- `.vocab-flash-card` `min-height`: 모바일 기준 `280px`로 축소(바텀바 공간 확보).

### M.12 접근성 & 기타

- 모든 아이콘 버튼에 `aria-label` 필수 (← 목록으로, 점프, 모름, 아는, 다음 단어).
- 평가 버튼에 `aria-keyshortcuts="1"` / `"2"` — 텍스트로는 안 보이지만 스크린리더/데스크톱 파워유저에 도움.
- `prefers-reduced-motion: reduce` 시 모든 swipe tilt, stage-enter, pulse 애니메이션 비활성화.
- 키보드 사용자를 위해: 히든이지만 `<kbd>` 마크업을 `aria-describedby`로 연결하는 것은 **하지 않는다** (UI 텍스트 제거 원칙 우선). 키보드 단축키는 JS에서만 동작.

### M.13 dev agent 구현 순서 (권장)

1. `vocab-study.js`의 문자열 리터럴 교체 (섹션 M.3 표 그대로).
2. `renderShell()` 시그니처 유지하되, hint 인자에 빈 문자열 전달. `.vs-kb-hint` 영역은 비어있으면 미렌더.
3. Stage B 렌더에서 `<span class="kbd-hint">[1]</span>` 제거, 버튼 레이블 `✕ 모름` / `✓ 아는`로 축약, `.vs-rate-btn` 클래스 추가.
4. Stage C 다음 버튼에 `.btn-block .vs-cta-next` 적용 + `▶` 제거하고 `다음 단어 →`로.
5. 헤더에서 `#vs-sound` 제거, 점프 바텀시트 내부로 이동.
6. 점프 드롭다운을 모바일(`matchMedia('(max-width: 767px)')`)에서 `.vs-sheet`로 렌더, 데스크톱은 기존 팝오버 유지.
7. `app.css`에 M.4~M.11 CSS 블록 추가, `.vocab-flash-card:hover`를 hover 미디어로 감싸기.
8. first-card hint: Stage B 첫 렌더 시 localStorage 플래그 검사 → 오버레이 삽입 → 첫 평가 이벤트에서 해제.
9. 스와이프 임계값·세로 오차 가드 조정 (M.5).
10. 키보드 리스너는 그대로 둔 채, 위 변경이 데스크톱(`window.innerWidth ≥ 768`)에서도 깨지지 않는지 확인.

### M.14 수용 기준 (acceptance)

- [ ] iPhone 13 mini(375px) Safari에서 Stage A/B/C 전 플로우를 **키보드 언급 없이** 수행 가능.
- [ ] 화면 어디에도 "Space", "Enter", "Esc", "J", "←/→", "1", "2", "[1]", "[2]" 문자열이 보이지 않음.
- [ ] 평가 버튼/다음 버튼의 탭 타겟이 ≥48px, safe-area bottom 인셋 안쪽에 위치.
- [ ] Stage B 좌/우 스와이프로 평가 가능, 드래그 중 틸트/색상 피드백 작동.
- [ ] 첫 세션에서만 스와이프 힌트가 뜨고, 첫 평가 후 사라지며 재방문 시 다시 뜨지 않음.
- [ ] 사운드 토글이 헤더에 없고 점프 바텀시트 내부에서 조작 가능.
- [ ] 데스크톱(≥768px)에서 Space/1/2/←/→/J/Esc 단축키가 여전히 동작(JS 레벨에서).
- [ ] `prefers-reduced-motion` 사용자에게 모든 과도한 애니메이션이 꺼짐.
- [ ] iPhone 노치/홈바와 겹치는 요소 없음 (safe-area-inset 검증).

---
*MOBILE REVISION 2026-04-06 작성. 위 섹션 3·5·7과 충돌 시 이 섹션 우선. dev agent는 M.13 순서대로 구현하고 M.14로 검수.*
