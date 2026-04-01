# Calendar Todo Widget — CLAUDE.md

## 프로젝트 개요

Electron 기반 데스크톱 달력 + 할일 관리 위젯. 날짜별로 할일(todo)을 관리하는 가벼운 앱.

## 기술 스택

- **런타임**: Electron v30 (Node.js + Chromium)
- **구조**: 단일 HTML/CSS/JS (프레임워크 없음, 순수 바닐라)
- **저장소**: `localStorage` (브라우저 내장, Electron webContents에서 사용)
- **빌드 도구**: 없음 (npm start → `electron .`)

## 파일 구조

```
main.js       — Electron 메인 프로세스 (창 생성, IPC 수신)
preload.js    — contextBridge로 electronAPI 노출
index.html    — 앱 뼈대 HTML
app.js        — 모든 UI 로직 (렌더러 프로세스)
style.css     — 모든 스타일
package.json  — electron ^30 devDependency
```

## 핵심 기능

### 날짜 창 (Date Window)
- 기본: 오늘 기준 **-3일 ~ +6일** (총 10일) 표시
- 컴팩트 모드: 오늘 하루만 표시, 창 크기 자동 축소 (최소 150px ~ 최대 400px)
- 오늘 날짜는 파란 왼쪽 테두리 + 연파란 배경으로 강조
- 과거 날짜는 `opacity: 0.5`로 흐리게 표시
- 어제/오늘/내일 라벨 표시 (파란 배지)
- 일요일은 빨간색, 토요일은 파란색

### Todo 관리
- 날짜별 todo 저장: `{ 'YYYY-MM-DD': [{ id, text, done }] }`
- todo ID: `Date.now()-randomString` 조합
- 완료된 항목은 미완료 항목 뒤로 자동 정렬
- 완료 표시: 취소선 + 회색 텍스트
- 인라인 추가: `+ 추가` 버튼 클릭 → input 바로 표시

### 드래그 앤 드롭
- todo를 다른 날짜 섹션으로 드래그 이동 가능
- 드래그 중 placeholder (점선 박스) 표시
- 드롭 시 done 상태 초기화
- 같은 날짜 내 드롭은 무시

### 잘라내기/붙여넣기 (Cut & Paste)
- `Ctrl+X`: 포커스된 todo 잘라내기 → clipboard에 임시 저장
- `Ctrl+V`: 포커스된 날짜에 붙여넣기 → 원본 삭제, done 상태 초기화
- 잘라내기 대기 중 클립보드 배너 표시
- `Esc`: 잘라내기 취소

### 키보드 탐색
- `↑/↓`: 항목 이동 (날짜 경계를 넘어서도 연속 이동)
- `Tab/Shift+Tab`: 날짜 섹션 이동
- `Enter`: 날짜 선택 시 todo 추가 / todo 선택 시 완료 토글
- `Space`: 완료 토글
- `F2`: 인라인 편집
- `Delete/Backspace`: 항목 삭제 (포커스 자동 이동)
- `Esc`: 선택 해제 / 잘라내기 취소

### 커스텀 단축키
- 설정 패널에서 7개 액션에 단축키 지정 가능
- 단축키 배지 클릭 → 키 입력 캡처 모드
- `Esc`로 캡처 취소, `×` 버튼으로 단축키 제거
- `localStorage('cal-shortcuts')`에 저장
- 기본값: `Ctrl+N`(추가), `Ctrl+X`(잘라내기), `Ctrl+V`(붙여넣기), `Ctrl+M`(컴팩트 토글)

### 우클릭 컨텍스트 메뉴
- todo 항목에서 우클릭 → "수정" / "삭제" 메뉴
- 창 경계를 벗어나지 않도록 위치 자동 조정

## Electron 창 설정

- **크기**: 기본 340×720, 최소 280, 최대 440 (너비)
- **프레임 없음** (`frame: false`): 커스텀 타이틀바 사용
- **배경색**: `#f5f5f7` (macOS 스타일)
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
  - 주색: `#007aff` (파란색)
  - 위험: `#ff3b30` (빨간색)
  - 텍스트: `#1c1c1e` (진한 검정)
  - 보조: `#8e8e93` (회색)
  - 비활성: `#aeaeb2`, `#c7c7cc`
- **폰트**: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Malgun Gothic` (한글 지원)
- **둥근 모서리**: 섹션 7px, 컨텍스트 메뉴 10px, 카드 16px
- **배경**: `#f5f5f7` (밝은 회색)
- **그림자**: 3단계 레이어드 box-shadow (브라우저 모드)

## 데이터 저장

- `localStorage('cal-todos')`: 할일 데이터 `{ 'YYYY-MM-DD': [{id, text, done}] }`
- `localStorage('cal-shortcuts')`: 커스텀 단축키 맵
- `userData/window-bounds.json`: 창 위치/크기

## 실행 방법

```bash
npm start   # electron .
```

## 주의사항

- `render._scrolled` 플래그로 오늘 날짜 자동 스크롤 중복 방지
- 설정 패널 열림 중에는 키보드 내비게이션 비활성화 (`Esc`만 동작)
- 드래그 중에는 `todo-input`이 생기지 않도록 처리
- Electron 모드(`body.electron-mode`)와 브라우저 모드 스타일 분리
- `contextIsolation: true` 보안 설정 유지
