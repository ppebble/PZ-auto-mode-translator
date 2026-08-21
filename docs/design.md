# 설계 초안 - B42 Stable 42.20.x+

## 목표

활성화된 PZ 모드에서 번역 가능한 텍스트를 발견하고, 사용자가 설정한 AI provider로 번역한 뒤, 원본 모드를 수정하지 않는 독립 번역팩을 생성한다.

## 권장 아키텍처

```text
PZ Lua controller/UI (B42 42.20+, single MVP mod)
  └─ scan: 활성 모드/JSON 번역 파일/관찰 가능한 문자열
       └─ job manifest (source, key, category, mod id, hash, context)
            └─ local worker (Node/Python)
                 ├─ translation memory/cache
                 ├─ glossary + prompt builder
                 ├─ OpenAI-compatible/Gemini/local provider
                 └─ placeholder/format validator
                      └─ generated pack (B42 JSON only)
                           └─ PZ reload + verification report
```

### 왜 게임 Lua에서 직접 API를 호출하지 않는가

- API 키가 모드 파일, 로그, 서버 동기화 경로에 노출될 수 있다.
- 대량 스캔/HTTP/재시도/JSON 파싱을 게임 메인 스레드에서 수행하면 멈춤이 발생한다.
- Steam Workshop 배포물에 개인 키를 넣을 수 없다.
- 모드가 서버에서 실행될 때 클라이언트 키와 서버 키의 의미가 달라진다.

따라서 게임 UI에서는 provider 설정과 작업 시작만 받고, 실제 호출은 로컬 worker가 담당한다. 직접 호출은 나중에 안전성 검토 후 선택 기능으로 둔다.

## 데이터 계약(v1 초안)

```json
{
  "id": "modId|relativeFile|category|key|sourceHash",
  "modId": "example_mod",
  "category": "UI",
  "key": "UI_Example_Button",
  "source": "Example Button",
  "context": "button label in settings window",
  "targetLanguage": "KO",
  "status": "pending"
}
```

결과에는 `sourceHash`, provider/model, timestamp, review 상태를 함께 저장한다. 원문이 바뀌면 이전 번역을 자동 재사용하지 않고 stale 처리한다.

## 번역 요청 규칙

- 한 번에 여러 행을 보내되 응답은 JSON 배열로 강제한다.
- key, source, context, targetLanguage를 분리한다.
- placeholder(`%1`, `%2`, `{0}`, `\n`, `<LINE>`, `<SIZE:...>`)는 번역 금지 토큰으로 보호한다.
- 고유명사/아이템명/게임 용어는 glossary 우선이다.
- 응답 개수, id, placeholder, 문자열 길이/제어문자, JSON 스키마를 검사한다.
- 실패·불확실·모델 거부 결과는 출력하지 않고 재시도/수동검수 큐로 보낸다.

## 단계별 구현

### Phase 0 - 완료

- Git 저장소 및 디렉터리 골격
- B42 Stable 42.20.x+ 단일 controller 모드 기본 파일
- provider 예시 및 비밀정보 제외 규칙
- 조사/설계 문서

### Phase 1 - 다음 작업

- 설치된 PZ 경로를 지정하는 PowerShell 설정
- B42 42.20 JSON parser의 fixture 테스트
- 번역 키/placeholder 차이 보고서
- 수동 TSV/JSON provider로 API 없이 end-to-end 검증

### Phase 2

- 활성 Workshop 모드 발견 및 mod load order 확인
- 누락 번역 job 생성
- local worker와 translation memory
- OpenAI-compatible provider + dry-run

### Phase 3

- B42 JSON output materializer inside the controller mod; separate pack is a later release option
- 원자적 파일 교체, backup, rollback
- 게임 재로드 후 샘플 키 검증
- UI의 진행률/실패/재시도/검수 상태

### Phase 4

- hardcoded Lua UI, scripts/definitions adapter
- 멀티플레이/서버 적용 정책
- Workshop 배포 전 라이선스·원본 모드 허가 검토

## 완료 조건

- 원본 Workshop 디렉터리 변경 없음
- API 키가 Git/Workshop/게임 로그에 없음
- 같은 입력 manifest가 같은 cache 결과를 재사용함
- placeholder와 키가 모두 보존됨
- 번역 실패 시 영어 fallback 또는 기존 번역으로 안전하게 남음
- 42.20.x+ Stable의 실제 게임에서 검증하기 전에는 호환 완료로 주장하지 않음




## MVP 배포 결정

초기 버전은 PZAITranslator 단일 모드로 배포한다. 자동 생성 번역 JSON은 controller 모드의 로컬 출력 영역에서 먼저 검증하고, 안정화 이후에만 별도 PZAITranslationPack으로 분리한다. 별도 pack은 코드/데이터 독립 배포와 load order 제어가 필요할 때 선택한다.

