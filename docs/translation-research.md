# 번역 시스템 조사 - B42 Stable 42.20.x+ (2026-08-21 기준)

## 1. Project Zomboid의 기본 번역 모델

PZ는 번역 문자열을 보통 **키 → 표시 문자열**로 관리한다. Lua 코드가 `getText("키")`/`Translator.getText(...)` 계열을 호출하면 현재 언어의 값을 찾고, 없으면 기본 영어 문자열로 되돌아가는 방식이다. 공식 Java API 문서의 `Translator.getText` 설명도 선택 언어의 번역이 없으면 영어 기본값을 반환한다고 명시한다.

B42 Stable 42.20.x+에서 우선 확인할 파일은 다음 JSON 레이아웃이다.

```text
42/media/lua/shared/Translate/EN/UI.json
42/media/lua/shared/Translate/KO/UI.json
42/media/lua/shared/Translate/EN/ItemName.json
```

파일은 UTF-8 JSON 객체이며, category 파일명은 엔진이 인식하는 고정 목록을 따라야 한다.

```text
{
    "UI_Loading": "Loading",
    "UI_XP": "XP : %1"
}
```

모드 번역패치는 원본 모드의 번역 키와 같은 키를 가진 대상 언어 파일을 별도 모드에 넣고, 로드 순서를 원본 모드보다 뒤로 배치해 같은 키의 값을 덮어쓴다. 따라서 번역팩은 원본 Lua를 복사하거나 수정하지 않는 것이 안전하다.

B42 Stable은 버전 선택 디렉터리(`42`, `42.20`, 이후 patch용 디렉터리)와 `common`을 사용하는 구조를 사용한다. 이 프로젝트는 B41 fallback을 만들지 않고 B42 레이아웃만 읽고 생성한다. 공식 개발 블로그는 B42가 현재 게임 버전에 맞는 하위 디렉터리를 선택한다고 설명한다.

> 주의: 42.20.x 이후 B42의 세부 JSON 카테고리와 패치 버전은 변경될 수 있다. 실제 구현 전에는 설치된 게임의 `media/lua/shared/Translate`와 테스트 모드에서 다시 확인한다.

## 2. 기존 접근법 비교

### A. 수동 번역팩 / TranslationZed 방식

- 원본 모드의 `Translate/<LANG>` 파일을 찾아 키를 번역한다.
- 장점: 결정적이고, 키/placeholder 보존이 쉽고, 게임 밖에서 검수 가능하다.
- 단점: 모드 업데이트마다 누락 키를 다시 찾아야 하며, 번역 파일이 없는 하드코딩 문자열은 못 찾는다.
- 결론: 최종 출력 포맷과 검증 규칙은 이 방식을 따라야 한다.

### B. Project Babel (PZ B42)

Workshop 설명에 공개된 파이프라인은 Workshop 모드 변경 감시, 주기적 텍스트 추출, 용어/참고 번역/RAG 문맥 구성, LLM 배치 호출이다. 결과는 번역 모드가 원본 모드 뒤에 오도록 설치해 우선순위를 얻는다.

- 장점: 플레이어 API 키 없이 대규모 사전 번역을 배포하고, 업데이트를 배치 처리한다.
- 단점: 서버 운영비/검수/저작권·배포 정책이 필요하고, 자동 추출 누락이 남는다.
- 우리 프로젝트에 적용할 점: 캐시, 용어집, 배치, 원본 모드 업데이트 감지, 번역팩 분리.

### C. RimWorld Auto-AI-Translation-Core 계열

공개 설명상 누락된 `Keyed`/`DefInjected`를 찾고, API 제공자·사용자 지정 Base URL·로컬 모델·용어 보호·전역 번역 메모리·XML Def 스캔·독립 출력팩을 제공한다.

PZ에 그대로 이식할 수는 없지만 핵심 개념은 재사용 가능하다.

1. 여러 Provider(OpenAI 호환/Gemini/로컬)를 같은 인터페이스로 추상화한다.
2. `{0}`, `%1`, `<LINE>` 같은 자리표시자와 게임 마크업을 보호한다.
3. 결과를 원본 모드가 아닌 `PZAITranslationPack`에 생성한다.
4. 번역 메모리로 이미 번역한 문장을 재사용한다.
5. UI 버튼을 눌렀을 때만 비동기로 실행한다.

### D. 현재 공개된 PZ Auto Translator 구현

공개 GitHub 구현은 B41 TXT와 B42 JSON을 별도 adapter로 처리하고, 활성 모드의 유효 번역을 스캔하며, 일부 하드코딩 Lua UI 문자열을 관찰하고, 번역 메모리·placeholder 검증·트랜잭션 출력·재로드 검증을 둔다. 이 구조는 우리 설계의 가장 가까운 참고 사례다.

## 3. 번역은 실제로 어떻게 적용되는가

1. 원본 모드가 영어 키/값을 제공한다.
2. 번역팩이 같은 번역 카테고리와 키를 대상 언어로 제공한다.
3. 게임의 현재 언어가 대상 언어이면 `Translator`가 번역팩 값을 반환한다.
4. 키가 없으면 기존 모드의 영어 또는 게임 기본 fallback이 나온다.
5. 같은 키가 여러 모드에 있으면 로드 순서/유효 모드 우선순위가 결과를 결정한다.

그러므로 AI가 문장만 번역하는 것은 충분하지 않다. **올바른 파일·카테고리·키·언어 디렉터리·로드 순서**가 맞아야 실제 화면에 나타난다.

## 4. 누락 영역

- 정식 Translate 파일의 누락 키
- `scripts`/item/recipe 정의에 직접 들어간 표시명
- `media/lua`에 문자열 리터럴로 하드코딩된 UI 문구
- 동적으로 합성되는 문장
- map/news/모드 설명처럼 일반 번역 테이블 밖에 있는 문서
- 서버가 생성하는 값, 저장 데이터, 채팅, 네트워크 payload

v1은 정식 번역 테이블을 먼저 지원하고, 하드코딩/정의 파일은 별도 adapter로 추가한다. 임의 영어 단어를 전부 번역하면 아이템 ID, 코드, URL, 함수명까지 망가질 수 있으므로 금지한다.

## 참고 자료

- [Project Zomboid Translator API](https://projectzomboid.com/modding/zombie/core/Translator.html)
- [The Indie Stone 공식 번역 저장소](https://github.com/TheIndieStone/ProjectZomboidTranslations)
- [Project Zomboid B42 모드 구조 안내](https://projectzomboid.com/blog/news/2024/08/tidy-up-time/)
- [Project Babel Workshop 설명](https://steamcommunity.com/sharedfiles/filedetails/?id=3759583822)
- [RimWorld Auto-AI-Translation-Core](https://github.com/as5611198/RimWorld-Auto-AI-Translation-Core)
- [PZ Auto Translator 참고 구현](https://github.com/hillegent/project_zomboid_auto_translator)






## 5. 현재 설치본 확인 결과

대상 경로 `C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid`를 읽기 전용으로 점검했다.

- `media/lua/shared/Translate/EN`에 JSON 카테고리 43개 확인
- `UI.json`은 약 2,240개의 키 라인을 포함
- `Workshop/ModTemplate` 존재
- 일부 JSON에는 대소문자만 다른 키가 함께 존재한다. 일반적인 PowerShell `ConvertFrom-Json`은 이를 중복 키로 거부하므로, parser는 키를 case-sensitive로 보존하고 duplicate/conflict를 명시적으로 보고해야 한다.
- 게임 파일은 수정하지 않았다.

## 6. B42.20.3 인코딩 주의

B42.20.3의 `Translator`는 번역 JSON의 첫 문자를 `{`로 파싱한다. PowerShell 5의 `Set-Content -Encoding utf8`가 생성하는 UTF-8 BOM(`EF BB BF`)이 파일 앞에 있으면 `A JSONObject text must begin with '{'` 오류가 발생한다. 모든 생성기는 **UTF-8 without BOM**으로 파일을 써야 한다. 검증 기준은 JSON 파일의 첫 3바이트가 `EF BB BF`가 아니고 `{`(`7B`)인지 확인하는 것이다.
