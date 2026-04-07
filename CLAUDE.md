# Calendar Todo Widget — CLAUDE.md

## 프로젝트 개요

Electron 기반 데스크톱 달력 + 할일 관리 위젯. 달력(Todo)과 타임라인(일정) 두 탭으로 구성.

## 기술 스택

- **런타임**: Electron v30 (Node.js + Chromium)
- **구조**: 순수 바닐라 HTML/CSS/JS (프레임워크 없음)
- **저장소**: `localStorage`
- **빌드**: `electron-builder` (`npm run build` → `dist/Calendar-Todo-win.zip`)

## 파일 구조

```
main.js       — Electron 메인 프로세스 (창 생성, IPC 수신)
preload.js    — contextBridge로 electronAPI 노출
index.html    — 앱 뼈대 HTML (탭 구조 포함)
app.js        — 달력/Todo UI 로직
style.css     — 달력 스타일
timeline.js   — 타임라인 UI 로직 (이벤트, 카테고리, 노트)
timeline.css  — 타임라인 스타일
package.json  — electron ^30 devDependency, electron-builder
```

## 탭 구조

헤더 아래 `달력` / `타임라인` 탭 전환. `activeTab` 상태로 관리.  
탭 전환 시 해당 div를 display 토글.

---

## 달력 탭 기능

### 날짜 창
- 기본: 오늘 기준 **-3일 ~ +6일** (총 10일) 표시
- 컴팩트 모드: 오늘 하루만 표시, 창 크기 자동 축소 (최소 150px ~ 최대 400px)
- 오늘 날짜: 파란 왼쪽 테두리 + 연파란 배경
- 과거 날짜: `opacity: 0.5`
- 어제/오늘/내일 라벨 (파란 배지)
- 일요일 빨간색, 토요일 파란색

### Todo 관리
- 날짜별 저장: `{ 'YYYY-MM-DD': [{ id, text, done }] }`
- todo ID: `Date.now()-randomString`
- 완료 항목은 미완료 뒤로 자동 정렬
- 완료 표시: 취소선 + 회색 텍스트
- 인라인 추가: `+ 추가` 버튼 → input 즉시 표시

### 드래그 앤 드롭 (Todo)
- todo를 다른 날짜로 드래그 이동
- 드래그 중 placeholder (점선 박스) 표시
- 드롭 시 done 상태 초기화
- 같은 날짜 내 드롭 무시

### 잘라내기/붙여넣기
- `Ctrl+X`: 포커스된 todo 잘라내기 → clipboard 임시 저장
- `Ctrl+V`: 포커스된 날짜에 붙여넣기 → 원본 삭제, done 초기화
- 대기 중 클립보드 배너 표시
- `Esc`: 잘라내기 취소

### 키보드 탐색
- `↑/↓`: 항목 이동 (날짜 경계 넘어 연속 이동)
- `Tab/Shift+Tab`: 날짜 섹션 이동
- `Enter`: 날짜 선택 시 todo 추가 / todo 선택 시 완료 토글
- `Space`: 완료 토글
- `F2`: 인라인 편집
- `Delete/Backspace`: 항목 삭제 (포커스 자동 이동)
- `Esc`: 선택 해제 / 잘라내기 취소

### 커스텀 단축키
- 설정 패널에서 8개 액션에 단축키 지정 가능
- 기본값: `Ctrl+N`(추가), `Ctrl+X`(잘라내기), `Ctrl+V`(붙여넣기), `Ctrl+M`(컴팩트 토글)
- 나머지 4개(탭 전환, 핀, 최소화, 닫기)는 기본값 없음
- 단축키 배지 클릭 → 키 캡처 모드, `Esc` 취소, `×` 제거

### 우클릭 컨텍스트 메뉴
- todo 우클릭 → "수정" / "삭제"
- 창 경계 벗어나지 않도록 위치 자동 조정

---

## 타임라인 탭 기능

### 개요
- 하루 단위 시간표 뷰 (00:00 ~ 24:00)
- `ROW_H = 56px` per hour (timeline.css의 `.timeline-hour-row` height와 동기화)
- 날짜 네비게이션: 이전/다음 날 버튼, 오늘로 돌아가기 버튼

### 이벤트 구조
`{ id, name, startMin, endMin, category }` — startMin/endMin은 자정 기준 분 단위

### 이벤트 생성/수정
- 빈 그리드 드래그 → 이벤트 생성 모달 (최소 15분 이상 드래그 시 열림)
- 이벤트 우클릭 → 수정/삭제 모달
- 모달에서 이름, 시작~종료 시간(5분 단위), 카테고리 선택

### 이벤트 드래그 이동
- 이벤트 블록 드래그 → 같은 날 시간 이동
- 5px 이상 움직여야 드래그로 인식 (클릭과 구분)
- 이동 중 반투명 preview 표시

### 노트 모달
- 이벤트 좌클릭 → 노트 모달 열림
- 세 섹션: `잘한 점` (초록) / `아쉬운 점` (주황) / `깨달은 점` (파랑)
- 각 섹션은 todo 리스트 형태: `+ 추가` 버튼 또는 `Ctrl+N`으로 항목 추가
- 항목 체크로 완료 표시, 더블클릭으로 인라인 편집, × 버튼으로 삭제
- `{ eventId: { good: [{id,text,done}], bad: [...], insight: [...] } }` 구조로 저장
- 기존 줄글 형태 데이터는 자동 마이그레이션 (한 항목으로 변환)

### 카테고리 관리
- 기본 카테고리: 업무(파랑), 개인(초록), 미팅(주황), 기타(회색)
- 이벤트 모달 내 "관리" 버튼 → 카테고리 매니저 (색상/이름 수정, 추가/삭제)
- 카테고리 삭제 시 해당 이벤트는 첫 번째 카테고리로 자동 이전
- 최소 1개 유지

### 현재 시간선 (Now Line)
- 오늘 날짜일 때만 표시, 30초마다 갱신
- 스크롤 초기 위치: 오늘이면 현재 시각 -1시간, 다른 날이면 08:00

### 스냅
- 마우스 이동: 10분 단위 스냅
- 모달 시간 입력: 5분 단위 (`step="600"`)

---

## Electron 창 설정

- **크기**: 기본 340×720, 최소 280, 최대 440 (너비)
- **프레임 없음** (`frame: false`): 커스텀 타이틀바
- **배경색**: `#f5f5f7`
- **창 위치/크기** 저장: `userData/window-bounds.json`
- **항상 위에**: `setAlwaysOnTop` 토글 (핀 버튼)
- **중앙 정렬**: 앱 시작 시 항상 화면 중앙
- **로그 파일**: `userData/app.log`

## IPC 통신 (preload.js → main.js)

| 렌더러 호출 | IPC 채널 | 동작 |
|---|---|---|
| `electronAPI.close()` | `win-close` | 창 닫기 |
| `electronAPI.minimize()` | `win-minimize` | 최소화 |
| `electronAPI.pin(bool)` | `win-pin` | 항상 위에 고정 |
| `electronAPI.resize(w,h)` | `win-resize` | 창 크기 변경 |

## 디자인 시스템

- **컬러**: macOS Human Interface 스타일
  - 주색: `#007aff`, 위험: `#ff3b30`, 텍스트: `#1c1c1e`, 보조: `#8e8e93`
- **폰트**: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Malgun Gothic`
- **둥근 모서리**: 섹션 7px, 컨텍스트 메뉴 10px, 카드 16px
- **배경**: `#f5f5f7`

## 데이터 저장 (localStorage)

| 키 | 내용 |
|---|---|
| `cal-todos` | `{ 'YYYY-MM-DD': [{id, text, done}] }` |
| `cal-shortcuts` | 커스텀 단축키 맵 |
| `cal-timeline` | `{ 'YYYY-MM-DD': [{id, name, startMin, endMin, category}] }` |
| `cal-cats` | `{ catId: { label, color } }` |
| `cal-notes` | `{ eventId: { good: [{id,text,done}], bad: [...], insight: [...] } }` |

파일: `userData/window-bounds.json` — 창 위치/크기

## 실행 / 빌드

```bash
npm start        # 개발 실행 (electron .)
npm run build    # 배포 빌드 → dist/Calendar-Todo-win.zip
```

## 주의사항

- `render._scrolled` 플래그로 오늘 날짜 자동 스크롤 중복 방지
- 설정 패널 열림 중 키보드 내비게이션 비활성화 (`Esc`만 동작)
- 드래그 중에는 `todo-input` 생성 차단
- Electron 모드(`body.electron-mode`)와 브라우저 모드 스타일 분리
- `contextIsolation: true` 보안 설정 유지
- `ROW_H` 상수는 `timeline.js`와 `timeline.css`에서 반드시 동기화
