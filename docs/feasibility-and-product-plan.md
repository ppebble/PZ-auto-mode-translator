# B42.20+ 자동 번역 모드 기획 및 실행 가능성

## 목표 사용자 흐름

```text
Workshop 구독/활성화
  -> 모드 설정에서 target language/provider/API key 입력
  -> 게임 중 "번역 실행"
  -> 활성 모드의 번역 후보 스캔
  -> AI API 호출 및 결과 검증
  -> 사용자 로컬 데이터에 번역 결과 저장
  -> 게임 재실행
  -> B42 번역 JSON을 초기 로딩하며 적용
```

이 흐름은 PZ의 로딩 모델에 맞는 현실적인 1차 목표다. 게임 중 생성한 파일을 같은 세션에서 즉시 번역 테이블로 다시 읽히게 하는 것은 별도 실험 대상으로 두고, 성공을 전제로 하지 않는다.

## 가능성 판정

| 기능 | 판정 | 근거/제약 |
|---|---|---|
| Workshop 모드 구독 후 설정 UI 제공 | 가능성 높음 | B42는 공식 Mod Manager와 Lua UI를 제공한다. 실제 옵션 UI 진입점은 샘플 모드로 확인한다. |
| API key 입력 | 가능 | UI 입력값을 메모리에서 받고 마스킹할 수 있다. |
| API key 재실행 후 보존 | 가능, 주의 필요 | PZ Lua의 파일 writer/reader API로 사용자 데이터에 저장할 수 있다. Workshop 디렉터리와 로그에는 저장하지 않는다. |
| 게임 실행 중 모드 텍스트 스캔 | 부분 가능 | 활성 모드와 파일 접근 범위를 확인해야 한다. `getModFileReader`는 특정 모드 파일 읽기 API를 제공한다. |
| 게임 실행 중 HTTPS/AI API 호출 | 미확정 | 공개 Lua API 문서에서 전용 HTTP 클라이언트 계약을 확인하지 못했다. Java 네트워크 클래스 직접 접근은 버전·보안·스레드 제약을 실험해야 한다. 1차는 로컬 worker 또는 오프라인 job으로 분리한다. |
| 번역 JSON 파일 생성 | 가능 | 모드 파일 writer와 일반 file writer API가 공개되어 있다. |
| 현재 실행 중인 세션에 즉시 번역 반영 | 낮음/미확정 | Translator가 초기 로딩한 테이블을 안전하게 재구성하는 공개 reload 계약이 없다. UI에 새 문자열을 직접 주입하는 우회는 전체 모드 적용을 보장하지 않는다. |
| 재실행 후 번역 적용 | 가능성 높음 | B42의 번역 파일은 초기 로딩 시 읽히며, 별도 번역팩을 원본 뒤에 두는 구조로 적용한다. |
| 싱글플레이 | 1차 지원 대상 | API key와 생성 파일이 사용자 로컬에만 존재한다. |
| 멀티플레이 | 후순위 | 서버/클라이언트가 동일한 번역팩과 생성 결과를 가져야 하며, API key를 서버나 다른 플레이어에게 노출하면 안 된다. |

## API key 저장 정책

설정 UI의 API key는 일반 ModOptions/sandbox 값으로 저장하지 않는다. Sandbox 옵션은 게임/월드 설정 성격이며 비밀값 저장소가 아니다.

권장 저장 위치:

```text
<User Zomboid data>\Lua\PZAITranslator\provider.json
```

권장 내용:

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "model": "...",
  "apiKey": "..."
}
```

- 파일은 사용자의 Zomboid 데이터 아래에 둔다.
- Git/Workshop 모드 폴더에는 저장하지 않는다.
- console.txt, 오류 메시지, 작업 manifest에는 key를 절대 기록하지 않는다.
- UI에는 마스킹과 `연결 테스트`를 제공한다.
- 첫 버전은 API key 삭제 버튼과 전체 데이터 삭제 버튼을 제공한다.
- 완전한 OS credential store 연동은 PZ Lua 모드만으로 보장하기 어렵기 때문에 후순위다.

PZ API 문서에는 `getFileReader`, `getFileWriter`, `getModFileReader`, `getModFileWriter`가 존재하지만, 이 API의 정확한 사용자 데이터 경로와 Workshop 쓰기 권한은 실제 fixture로 확인한다. [LuaManager.GlobalObject API](https://projectzomboid.com/modding/zombie/Lua/LuaManager.GlobalObject.html)

## 권장 구현 구조

### Controller 모드

담당:

- 설정 화면
- 작업 시작/취소
- 현재 상태/오류 표시
- 스캔 job 생성
- 번역 결과를 번역팩에 전달

### Local worker

담당:

- API 호출
- timeout/retry/rate limit
- provider adapter
- translation memory
- placeholder 검증
- JSON materialization

이 분리를 권장하는 이유는 게임 Lua에 HTTP와 대량 처리 책임을 넣으면 게임이 멈추거나 API key가 노출될 위험이 크기 때문이다.

### Translation pack

담당:

- B42 `common/mod.info` 또는 `42.20/mod.info` 레이아웃
- `media/lua/shared/Translate/KO/*.json`
- 원본 모드 파일 수정 금지
- 원본보다 늦은 load order

B42 번역 파일은 UTF-8 JSON이고, 엔진이 인식하는 고정 category 파일명만 사용해야 한다. [B42.20 API/모드 구조 참고](https://steamcommunity.com/sharedfiles/filedetails/?id=3776551449)

## 먼저 해야 할 실험

### Experiment A — 설정 저장

1. `getFileWriter`로 사용자 파일 생성
2. API key 저장/재실행 후 읽기
3. console.txt에 key가 남지 않는지 확인
4. 삭제 버튼 동작 확인

### Experiment B — 번역팩 발견

1. 테스트 모드에 `KO/UI.json` 생성
2. 게임 시작 후 실제 번역 적용 확인
3. `common`과 `42.20` 배치 각각 확인
4. 원본보다 늦은 load order 확인

### Experiment C — 실행 중 파일 생성

1. 게임 중 번역 JSON 생성
2. 현재 세션에서 새 키 조회
3. 메뉴 이동/언어 변경/Translator reload 시도
4. 재실행 후 동일 파일 적용 확인

예상 결과는 “현재 세션 즉시 적용 실패, 재실행 적용 성공”이다. 이 결과면 림월드식 사용자 흐름의 마지막 단계인 재실행 구조를 정식 채택한다.

### Experiment D — 네트워크

1. 실제 API key 없이 localhost mock server 사용
2. 작은 JSON 1건만 요청
3. timeout/실패/재시작 처리
4. 게임 FPS와 console.txt 확인
5. 직접 네트워크 호출이 불안정하면 local worker를 정식 사용

## 제품 기획 v1

### 화면

- Provider
- Base URL
- Model
- API key
- Target language
- 현재 저장 상태
- 연결 테스트
- 번역 시작
- 진행률
- 실패 항목
- 번역팩 적용 대기 / 재실행 안내

### 기본 동작

- 자동 번역은 기본 비활성
- 사용자가 `번역 시작`을 눌렀을 때만 실행
- 기존 번역은 보존
- 변경된 원문만 재번역
- 실패 항목은 영어 fallback 유지
- 결과는 재실행 전까지 `pending restart`

### v1에서 제외

- 현재 세션의 완전한 실시간 번역 반영
- 모든 하드코딩 영어 문자열 추출
- 서버에서 API key 보관
- 자동 Workshop 업로드
- 원본 모드 직접 수정

## 결론

림월드와 같은 큰 흐름인 `구독 → 키 등록 → 게임 중 번역 → 재실행 적용`은 B42.20+에서 제품 설계로 채택할 수 있다. 다만 PZ에서는 **번역 실행과 번역 적용을 분리**해야 한다.

가장 안전한 MVP는 다음이다.

```text
게임 설정 UI
  -> 로컬 저장
  -> 버튼으로 번역 작업 시작
  -> 로컬 worker/API 호출
  -> 검증된 B42 JSON 번역팩 생성
  -> "게임을 재실행하면 적용됩니다" 표시
```

## 6. Experiment A/B 결과 (B42.20.3 실측)

`PZAIProbe`를 `C:\Users\ask13\Zomboid\mods\PZAIProbe`에 설치하고 새 테스트 월드에서 확인했다.

```text
PZAIProbe: TRANSLATION=PZ AI Translator probe: Korean
PZAIProbe: FILE_WRITER_OK
PZAIProbe: FILE_READER=probe-created
```

판정:

- B42.20.3의 `KO/UI.json` 번역팩 로딩: 통과
- `getFileWriter()` 사용자 파일 저장: 통과
- `getFileReader()` 사용자 파일 재읽기: 통과
- 설정값을 재실행 후 보존하는 기반: 확보
- JSON/Lua 모두 UTF-8 without BOM 필요: 확인

다음은 API 호출 없이 `provider.json`을 저장하는 실제 controller storage 계층과 설정 UI를 만든다.
