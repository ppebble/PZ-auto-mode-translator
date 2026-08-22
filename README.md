# PZ AI Translator

Project Zomboid **Build 42 Stable 42.20.x 이상 전용** 자동 번역 모드 개발 저장소입니다. 목표는 번역패치가 없는 활성 모드의 텍스트를 찾아 사용자가 등록한 AI API로 번역하고, 원본 모드를 건드리지 않는 별도 번역팩으로 적용하는 것입니다.

## 현재 상태

- 개발 기반 초기화 완료
- B42 Stable 42.20.x+ 전용 모드 골격 생성
- 기존 번역 시스템 및 자동 번역 파이프라인 조사 문서: [`docs/translation-research.md`](docs/translation-research.md)
- 구현 설계/단계: [`docs/design.md`](docs/design.md)
- 로컬 실행 설정 예시: [`config/provider.example.json`](config/provider.example.json)
- B42.20.3의 활성 모드를 실제 스캔해 번역 후보와 기존 번역 여부를 확인합니다.
- 스캔 → 규칙 적용 → AI 호출 → placeholder 검증 → 별도 JSON 번역팩 생성 워커를 구현했습니다.

## 안전 원칙

1. 원본 Workshop 모드와 게임 설치 파일을 수정하지 않습니다.
2. API 키는 `config/provider.local.json` 또는 사용자별 Zomboid 캐시 외부에만 둡니다. 이 파일은 Git에서 무시됩니다.
3. 번역 결과는 placeholder/서식/키 충돌 검증을 통과한 것만 번역팩에 씁니다.
4. 기본값은 오프라인 스캔이며, AI 호출은 명시적으로 실행합니다.
5. 멀티플레이에서는 서버/클라이언트 적용 범위를 별도로 검증합니다.

## 개발 시작

```powershell
# 저장소 점검
.\tools\setup.ps1 -CheckOnly

# 설치된 B42 파일 구조 점검
.\tools\inspect-b42.ps1

# 로컬 설정 생성(키는 직접 입력하지 않고 파일을 별도로 편집)
Copy-Item config/provider.example.json config/provider.local.json

# 번역 모드 설치 경로 탐색
.\tools\setup.ps1 -PrintPaths
```

현재 설치된 게임 경로는 `C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid`이며, 사용자 데이터의 실제 버전은 `42.20.3`으로 확인되었습니다. B41 및 B42 Unstable/42.19 이하는 지원 대상에서 제외합니다. Steam 라이브러리 위치가 확인되면 `-ZomboidHome`과 `-GameRoot`를 명시합니다.

## Helper 배포 패키지 만들기

창작마당 모드와 별도로 배포할 Helper ZIP은 다음 명령으로 생성합니다.

```powershell
.\tools\package-helper.ps1 -Version 0.1.0-beta.1
```

`dist\PZ-AI-Translator-Helper-0.1.0-beta.1.zip`에는 실행/종료 VBS, worker, 기본 규칙, 한국어 안내만 들어갑니다. API Key·runtime·생성 번역팩은 포함하지 않습니다. 구조와 사용자 설치 흐름은 [`docs/helper-distribution.md`](docs/helper-distribution.md)를 참조합니다.





## 스캔 실행

```powershell
node .\tools\worker\scan-b42.cjs `
  --zomboid-home "$env:USERPROFILE\Zomboid" `
  --target-language KO `
  --output .\runtime\scan-manifest.json
```

`runtime/`은 Git에 포함되지 않으며, 결과 manifest는 AI 호출 전에 모드 선택과 수동 규칙 검토에 사용합니다.

## 실제 번역 실행

1. `config/provider.example.json`을 `config/provider.local.json`으로 복사하고 **API 플랫폼에서 발급한** 키와 모델을 넣습니다. ChatGPT 구독과 API 과금은 별개입니다.
2. 먼저 형식 검증만 하려면 아래처럼 실행합니다. 생성물에는 테스트 문구가 들어가므로 게임에 설치하지 마십시오.

```powershell
.\tools\run-translation.ps1 -DryRun
```

3. 실제 API 번역 및 설치는 다음 명령입니다. `-Install`은 `Zomboid\mods\PZAITranslationGenerated`만 교체하며 Workshop 원본은 수정하지 않습니다.

```powershell
.\tools\run-translation.ps1 -Install
```

완료 뒤 새 번역팩 `PZAITranslationGenerated`를 활성화하고 메인 메뉴로 나갔다가 월드에 다시 들어갑니다. 게임 안의 `Mod Options → PZ AI Translator → Queue translation` 버튼은 설정을 저장하고 로컬 작업 요청 파일을 만드는 연결점입니다. 게임 Lua는 외부 Node 프로세스를 직접 실행할 수 없으므로, 번역은 외부 Helper가 처리합니다.

생성할 언어는 게임의 현재 표시 언어와 같아야 적용됩니다. 예를 들어 게임이 한국어(`KO`)면 `KO` 번역팩만 로드하며, 일본어 번역을 보려면 `JP`로 생성한 뒤 게임 언어도 일본어로 바꾸고 재시작해야 합니다. PZ 코드 `JP`는 API 호출 시 공급자 코드 `JA`로 자동 변환됩니다.

### 공급자와 모델

- **Google Gemini API**: `gemini-2.5-flash-lite`가 기본값이며, 계정별 무료 티어/할당량이 적용됩니다.
- **DeepL API**: 대화형 모델이 아니라 `default`, `prefer_quality_optimized`, `quality_optimized`, `latency_optimized` 번역 모드를 선택합니다.
- **OpenAI API / OpenAI-compatible custom**: 계정에서 사용 가능한 모델 ID를 사용합니다.

정적 목록은 공급자의 계정 권한과 출시 상태를 완전히 대변할 수 없으므로, API 키 기준의 실제 목록은 다음 명령으로 확인합니다. 출력에는 API 키를 저장하지 않습니다.

```powershell
node .\tools\worker\list-provider-models.cjs
```

명령은 게임에 저장한 API 설정을 읽고 `Zomboid\Lua\PZAITranslator_models.ini`에 계정별 목록을 저장합니다. 게임을 재시작하면 `Translation model` 드롭다운의 `Account:` 항목으로 표시됩니다. 별도 JSON 설정 파일을 쓰는 경우에는 `--provider .\config\provider.local.json`을 지정합니다.

### 게임 버튼으로 실행하기

개발 중에는 별도 PowerShell 창에서 감시 워커를 시작할 수 있습니다.

```powershell
.\tools\watch-translation-jobs.ps1
```

배포용 기본 흐름은 `tools\PZAITranslatorHelper.vbs`를 더블 클릭하는 것입니다. 같은 폴더의 감시 워커가 **숨김 창**으로 단일 인스턴스 실행되고, 시작 또는 이미 실행 중이라는 안내 창이 표시됩니다. 그 뒤 게임의 `Queue translation`을 누르면 `Zomboid\Lua`에 요청을 쓰고, Helper가 설정된 API 키를 읽어 번역팩을 설치합니다. 상태는 `Zomboid\Lua\PZAITranslator_status.ini`에 기록됩니다. 이 보조 프로세스는 게임 밖에서만 API를 호출하므로 게임 Lua에 HTTP/프로세스 실행 권한을 요구하지 않습니다.

Helper를 종료하려면 같은 폴더의 `Stop-PZAITranslatorHelper.vbs`를 더블 클릭합니다. 이 종료 파일은 `watch-translation-jobs.ps1`으로 실행된 Helper만 종료하며, 사용자가 열어 둔 다른 PowerShell 창은 건드리지 않습니다.
