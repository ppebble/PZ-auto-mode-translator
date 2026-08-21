# 자동 번역 범위 및 사용자 제어 기획

## 제품 목표

활성화된 B42.20.x+ 모드를 기본으로 모두 선택하고, 목표 언어 번역이 없거나 비어 있는 문자열만 자동 번역한다. 기존 번역은 보존하며, 사용자가 모드 단위로 제외하거나 수동 규칙으로 결과를 덮어쓸 수 있어야 한다.

```text
활성 모드 발견
  -> 기본 전체 선택
  -> 모드별 선택/제외
  -> 추출 가능한 번역 후보 수집
  -> 기존 대상 언어 보호
  -> 수동 규칙/용어집 적용
  -> Translation Memory 재사용
  -> AI 번역
  -> placeholder/JSON 검증
  -> pending-restart 번역팩 생성
```

## 번역 범위 등급

### Tier 1 — MVP 필수: 공식 Translate JSON

대상:

```text
media/lua/shared/Translate/<LANG>/*.json
```

엔진 고정 category만 처리한다. 예: `UI`, `IG_UI`, `ItemName`, `Tooltip`, `ContextMenu`, `Recipes`, `Sandbox`, `RecipeGroups`, `EvolvedRecipeName`, `MapLabel`.

처리 규칙:

- EN/source key가 있는 항목만 후보로 만든다.
- target JSON에 동일 key의 비어 있지 않은 값이 있으면 보호한다.
- target 파일이 없으면 생성한다.
- target에 일부 키만 있으면 누락 키만 번역한다.
- key, category, 파일명은 번역하지 않는다.
- 모드가 제공한 기존 대상 언어 번역은 AI 결과로 덮어쓰지 않는다.

이 등급만으로도 대부분의 UI, 아이템명, tooltip, recipe, sandbox label을 처리할 수 있으며 첫 릴리스의 완료 범위로 삼는다.

### Tier 2 — B42 제작창 레시피 키

지원:

- 활성 모드의 유효한 `media/scripts/**/*.txt`에서 `craftRecipe <식별자>`를 추출한다.
- `Translate/<target>/Recipes.json` 오버레이 항목으로 생성한다.
- 이미 `Translate/EN/Recipes.json`에 같은 키가 있으면 그 사람이 읽을 수 있는 원문을 우선한다.

이 등급은 `Salvage Vehicle Doors`처럼 B42 스크립트에 직접 적힌 제작창 이름을 처리한다. `category = Salvage` 같은 임의 category 값의 엔진 번역 가능 여부는 모드별 구현 차이가 있어 보장하지 않는다.

### Tier 3 — 정의 파일의 허용 필드

추후 지원:

- `media/scripts`의 item `DisplayName`, `Tooltip`
- recipe의 표시용 name/tooltip
- 명시적으로 번역 가능한 description/label 필드

파일 전체를 자연어로 번역하지 않고, 구조를 파싱한 뒤 허용 필드만 대상으로 한다. ID, module, type, icon, texture, Lua callback, 숫자, 확률, 조건식은 절대 번역하지 않는다.

### Tier 4 — Lua 하드코딩 문자열

가장 위험하므로 기본 비활성이다.

허용 후보:

- 활성 모드에서 실제 UI sink로 전달된 문자열
- 명시적인 번역 표식이 있는 문자열
- 사용자가 선택한 파일/모드의 제한된 문자열

제외:

- URL, 파일 경로, item ID, 함수명, 변수명
- 네트워크 payload, 저장 데이터, 채팅
- 동적 문자열 전체
- 코드, 주석, 로그
- 임의 영어 단어 스캔

## 모드 선택 UX

기본값은 현재 활성 모드 전체 선택이다. 단, 다음은 기본 제외한다.

- `PZAITranslator` 자신
- 순수 라이브러리/framework 모드
- 기존 번역 전용 모드
- 게임 본체/vanilla 영역
- 사용자가 이전에 제외한 모드

화면 구성:

```text
[전체 선택] [전체 해제] [번역 후보가 있는 모드만]

[x] Mod A       183 pending / 40 existing / 0 failed
[x] Mod B        12 pending / 90 existing / 3 failed
[ ] Framework    0 pending / skipped
```

각 모드에는 다음을 표시한다.

- mod ID와 표시명
- 경로/Workshop ID
- source 파일 수
- 후보 키 수
- 기존 번역 수
- pending/translated/failed 수
- 마지막 source hash
- 이번 작업에 포함할지 여부

현재 활성 모드 목록은 B42의 mod list와 `getMods()`/`getModDirectoryTable()` 계열 정보를 결합한다. 단일 파일만 믿지 않고 실제 로드된 모드와 파일 경로를 교차 검증한다.

## 수동 번역 규칙

정규식 규칙은 게임 Lua에서 실행하지 않고 로컬 Worker에서 적용한다. 규칙이 Lua에 들어가면 PZ의 제한된 패턴 문법과 게임 업데이트에 영향을 받기 때문이다.

규칙 종류:

1. **Exact** — 정확히 일치하는 원문을 지정 번역으로 교체
2. **Regex** — 문자열 값에만 정규식 적용
3. **Glossary** — 용어/고유명사 보호 및 일관 번역
4. **Do-not-translate** — 원문 보존

예시:

```json
{
  "scope": { "modId": "example_mod", "category": "ItemName" },
  "kind": "regex",
  "pattern": "\\bMRE\\b",
  "replacement": "전투식량",
  "priority": 100,
  "enabled": true
}
```

적용 우선순위:

```text
기존 대상 언어 보호
> do-not-translate
> exact
> regex
> glossary
> translation memory
> AI
```

정규식 안전 규칙:

- key가 아닌 value에만 적용
- 기본 scope는 현재 모드/category
- global 규칙은 별도 확인 필요
- 결과에 placeholder/마크업이 바뀌면 거부
- 규칙마다 preview 제공
- 원문/변경 결과/적용 규칙 ID를 기록
- regex가 빈 문자열 또는 과도하게 많은 항목에 매칭되면 차단

## 자동 번역 정책

- 기존 번역을 덮어쓰지 않는다.
- source hash가 바뀐 기존 AI 번역은 stale로 표시한다.
- 동일 source/context/target은 Translation Memory에서 재사용한다.
- 새 번역은 기본적으로 `machine_pending_review` 상태다.
- 검증 통과 전에는 번역 JSON에 쓰지 않는다.
- 번역 결과를 적용하려면 재실행이 필요하다.

상태:

```text
unseen -> pending -> translated -> validated -> generated -> pending_restart -> applied
                         \-> failed
                         \-> needs_review
```

## API 비용/작업량 제어

- 기본 batch size는 20~50개
- 긴 설명은 별도 batch
- 동일 원문은 한 번만 요청
- 기존 번역/용어집/TM 우선
- 예상 문자/토큰/요청 수를 실행 전에 표시
- 사용자가 모드별로 작업량을 해제할 수 있게 한다.
- 중단 후 재개 가능해야 한다.

### 기존 번역 건너뛰기 정책

- 기본 동작은 **문자열 단위 보호**다. 동일 key에 비어 있지 않은 target 값이 있으면 해당 문자열을 AI에 보내지 않는다.
- `Skip mods that already provide the target language`를 켜면 대상 언어 JSON이 하나라도 있는 모드는 통째로 제외한다. 부분 번역의 빈 항목도 남기므로, 완성된 한국어 번역 모드를 보존하려는 경우에만 사용한다.
- 모드 선택 목록은 Mod Options의 정적 페이지가 아니라 별도 동적 선택 창에서 제공한다. 그 창은 열거나 Refresh할 때마다 `getActivatedMods()`를 다시 읽고, 선택한 mod ID만 Worker에 전달해야 한다.

## MVP 확정 범위

현재 자동 번역 버전은 다음만 보장한다.

- B42.20.x+ 활성 모드 목록
- 기본 전체 선택 및 모드별 제외
- Tier 1 공식 Translate JSON 및 Tier 2 B42 `craftRecipe` 키
- 기존 target 번역 보호
- exact/regex 수동 규칙
- glossary와 placeholder 보호
- AI 결과 검증
- 재실행 적용

다음은 MVP 완료 후 추가한다.

- Lua 하드코딩 탐지
- 실시간 현재 세션 적용
- 멀티플레이 자동 배포
- Workshop 자동 업로드

## 현재 설치본 스캔 결과 (B42.20.3)

`tools/worker/scan-b42.cjs`로 현재 `mods/default.txt`의 활성 모드를 읽고, local/Workshop 경로를 해석했다.

```text
activeMods:       222
resolvedMods:     221 (PZAITranslator 제외)
translateRoots:   334
JSON files:       268
B42 script files: 5,892
craftRecipe keys: 1,432
existing KO:      1,536
pending KO:       13,119
normalized:        8
errors:        0
```

초기 설치본은 활성 모드 목록의 줄바꿈을 잘못 파싱해 매 두 번째 모드를 건너뛰었다. 따라서 당시 생성된 630개 키 번역팩에는 AutoAll과 VehicleSalvageOverhaulB42가 포함되지 않았다. 현재 스캐너는 이 문제를 수정했다.

서로 다른 모드가 같은 category/key를 서로 다른 원문으로 쓰는 경우에는 한 개의 전역 번역팩으로 안전하게 구분할 수 없다. materializer는 이런 충돌 키를 임의로 덮어쓰지 않고 결과 팩에서 제외하며 `pack-report.json`의 `conflicts`에 기록한다.

두 파일은 B42 엔진이 허용하는 trailing comma 때문에 표준 `JSON.parse`에서 실패했으므로, 스캐너는 안전한 trailing comma 정규화 후 처리하고 `normalizedJson`으로 기록한다. 이후 materializer는 원본 파일을 수정하지 않고 정규 JSON으로 별도 출력한다.

실제 자동 번역 요청 전에는 version folder 중 B42.20에 유효한 경로만 선택하는 adapter와 duplicate source root 제거를 추가한다.
