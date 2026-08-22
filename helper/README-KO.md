# PZ AI Translator Helper

Project Zomboid **Build 42 Stable 42.20.x 이상**에서 PZ AI Translator 창작마당 모드가 만든 번역 요청을 처리하는 로컬 프로그램입니다.

## 포함하지 않는 것

- API Key
- 생성된 `PZAITranslationGenerated` 번역 모드
- Workshop 원본 모드 또는 게임 파일

모든 API Key와 번역 결과는 각 사용자의 `C:\Users\<사용자>\Zomboid` 폴더에만 저장됩니다.

## 사전 조건

1. Steam에서 **PZ AI Translator**를 구독하고 활성화합니다.
2. [Node.js 20 LTS 이상](https://nodejs.org/)을 설치합니다. 설치 뒤 PowerShell에서 `node --version`이 표시되어야 합니다.
3. 이 ZIP을 Steam 또는 Program Files가 아닌 쓰기 가능한 폴더에 **전체 압축 해제**합니다. 예: `C:\Users\<사용자>\Documents\PZ-AI-Translator-Helper`

## 사용 방법

1. `START-PZAITranslatorHelper.vbs`를 더블클릭합니다. 시작 안내가 표시되면 창을 닫아도 Helper는 백그라운드에서 실행됩니다.
2. 게임에서 Provider, 모델, API Key, 대상 언어를 저장하고 `Test connection`을 실행합니다.
3. 정보창의 `AI Translator` 탭에서 번역할 모드를 선택하고 `Queue translation`을 누릅니다.
4. 게임의 Translation status가 `complete`가 될 때까지 기다립니다.
5. `PZAITranslationGenerated`를 활성화한 뒤 메인 메뉴로 나갔다가 월드에 다시 입장합니다.

## 종료

`STOP-PZAITranslatorHelper.vbs`를 더블클릭합니다. 이 파일은 PZ AI Translator Helper만 종료하며 다른 PowerShell 창은 종료하지 않습니다.

## 문제 해결

- `failed: node ...` : Node.js를 설치한 뒤 Helper를 다시 시작합니다.
- `queued`에서 멈춤 : Helper가 실행 중인지 확인하고 `START...vbs`를 다시 실행합니다. 이미 실행 중이라는 메시지가 나오면 정상입니다.
- `429` 또는 `456` : API 제공자의 요청/사용량 한도입니다. API 대시보드에서 해당 프로젝트와 모델의 quota를 확인한 뒤 다시 시도합니다.
- 번역이 바로 보이지 않음 : 생성팩을 활성화하고 메인 메뉴로 나간 뒤 월드에 다시 입장해야 합니다.
