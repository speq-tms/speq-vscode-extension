Отлично, раз подход утверждён, давайте превратим концепцию в конкретное руководство к действию для команды разработки. Ниже — детальный план работ по расширению, инструкция по локальной отладке и описание пайплайна релиза, интегрированного с текущей инфраструктурой Speq.

---

1. Детальный план доработок (speq-vscode-extension)

1.1. Модуль «Интеллектуальная работа с YAML»

Цель: Убрать зависимость от вызова CLI для валидации, сделать написание тестов быстрым и безошибочным.

Задача Реализация Ожидаемый эффект
JSON Schema Bundling Скопировать схемы из speq-contracts/schemas/ в speq-vscode-extension/schemas/. Обновить package.json в секции yamlValidation. Мгновенная подсветка ошибок, автодополнение ключей assert, request, steps.
Сниппеты (Snippets) Создать файл .vscode/speq.code-snippets с шаблонами: test, suite, assert-equal, request-get. Ввод stest + Tab разворачивает заготовку теста с обязательными полями.
Семантическая подсветка В package.json добавить grammars для подсветки переменных вида $env.BASE_URL и встроенных функций $rand(). Визуальное выделение динамических частей теста, меньше ошибок при написании.

Пример конфигурации package.json:

```json
"contributes": {
  "yamlValidation": [
    {
      "fileMatch": "**/.speq/**/*.yaml",
      "url": "./schemas/test-v1.json"
    }
  ],
  "snippets": [
    {
      "language": "yaml",
      "path": "./snippets/speq-snippets.json"
    }
  ]
}
```

1.2. Модуль «Расширенный Test Explorer»

Цель: Отображать не только структуру, но и состояние выполнения.

Задача Реализация Ожидаемый эффект
Кэширование статусов В классе SpeqTreeDataProvider добавить Map<TestItem, TestStatus>. При клике на Refresh сбрасывать кэш. Иконка 🟢 после успешного прогона сохраняется до следующего запуска или переключения ветки.
Группировка по тегам Добавить кнопку Group by Tag в заголовке Tree View. Перестраивать дерево, группируя файлы по ключу tags из YAML. Быстрый поиск всех smoke или regression тестов.
Контекстное меню В package.json прописать view/item/context с командами: speq.runTest, speq.debugTest, speq.openInEditor. Запуск конкретного теста в 1 клик без открытия файла.

1.3. Модуль «Визуализация результатов (Reporter)»

Цель: Показывать отчет о прогоне в панели VS Code, а не в терминале или внешнем HTML.

Задача Реализация Ожидаемый эффект
Webview Panel Создать класс ReportPanel. При запуске тестов с флагом --format json парсить stdout и рендерить HTML с таблицей результатов и графиком Pass/Fail. Удобный просмотр логов ошибок прямо в среде разработки.
Интеграция с проблемами (Problems) При наличии ошибок в тесте добавлять записи в vscode.DiagnosticCollection с ссылкой на строку в YAML. Двойной клик по ошибке в панели проблем открывает файл на нужной строке.

Пример интерфейса Webview:

```typescript
export class ReportPanel {
  public static render(content: string) {
    // content = результат `speq run --json`
    const panel = vscode.window.createWebviewPanel('speqReport', 'Speq Run Report', vscode.ViewColumn.Two);
    panel.webview.html = getHtmlTemplate(JSON.parse(content));
  }
}
```

1.4. Модуль «Умный запуск с параметрами»

Цель: Упростить выбор окружения (--env) и тегов (--tags).

Задача Реализация Ожидаемый эффект
Quick Pick для Env При выполнении команды speq.runWithParams запрашивать vscode.window.showQuickPick, парся список окружений из manifest.yaml. Не нужно помнить точные имена staging-2 или dev-eu.
Multi-step Input для тегов Использовать vscode.window.createQuickPick с возможностью множественного выбора. Сборка сложных выражений тегов (smoke AND api) без синтаксических ошибок.

---

2. Локальный запуск и отладка расширения

Инструкция для разработчика перед первым коммитом в speq-vscode-extension:

Шаг 1: Клонирование и установка зависимостей

```bash
git clone https://github.com/speq-tms/speq-vscode-extension.git
cd speq-vscode-extension
npm install
```

Шаг 2: Сборка и запуск в режиме разработки (Debug)

1. Откройте папку проекта в VS Code.
2. Нажмите F5 или перейдите в Run and Debug (Ctrl+Shift+D) и выберите конфигурацию Run Extension.
3. Откроется новое окно VS Code с подписью [Extension Development Host].

Шаг 3: Тестирование фич в Dev-окне

· Проверка YAML: Откройте папку с примерами из speq-examples (или создайте файл .speq/test.yaml). Убедитесь, что срабатывает автодополнение и валидация.
· Проверка CLI: Убедитесь, что speq установлен локально (brew install speq-cli или через go install). Выполните команду Speq: Initialize Workspace через Command Palette (Ctrl+Shift+P).
· Проверка Tree View: В левой панели найдите иконку Speq и нажмите Refresh. Должно появиться дерево тестов.

Шаг 4: Горячая перезагрузка изменений

Если вы меняете код расширения (.ts файлы):

1. Нажмите Ctrl+R в окне [Extension Development Host].
2. Окно перезагрузится с новым кодом, состояние папки сохранится.

Шаг 5: Логирование

Для отладки используйте console.log. Вывод будет виден в Debug Console основного окна VS Code (того, откуда вы нажали F5).

---

3. Процесс релиза и публикации расширения

Цель: Автоматизировать публикацию в VS Code Marketplace и синхронизировать версии с основным проектом Speq.

3.1. Текущая инфраструктура (на основе анализа репозиториев)

· speq-cli: Релизы через Homebrew, версионирование vX.Y.Z.
· speq-contracts: Хранит JSON Schemas (SemVer).
· speq-vscode-extension: Должен публиковаться в VS Code Marketplace и Open VSX Registry.

3.2. Настройка GitHub Actions для автоматического релиза

Добавьте в репозиторий speq-vscode-extension файл .github/workflows/release.yml:

```yaml
name: Publish Extension

on:
  push:
    tags:
      - 'v*' # Запуск при создании тега версии, например v1.2.0

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      
      # Линтинг и сборка (если требуется)
      - run: npm run lint
      - run: npm run compile

      # Публикация в Marketplace
      - name: Publish to VS Code Marketplace
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VS_MARKETPLACE_TOKEN }}
          registryUrl: https://marketplace.visualstudio.com
          
      # Опционально: публикация в Open VSX (для VSCodium)
      - name: Publish to Open VSX
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.OPEN_VSX_TOKEN }}
```

3.3. Синхронизация версий со speq-cli

Рекомендуемая стратегия: Семантическое версионирование с привязкой к мажорной версии CLI.

· Правило: Расширение версии 1.2.x совместимо с CLI версии 1.x.x. Изменения мажорной версии в CLI (например, 2.0.0) требуют выпуска мажорной версии расширения.
· Действие: При создании тега v1.3.0 в speq-cli, создаем тег v1.3.0 в speq-vscode-extension с аналогичными или совместимыми изменениями.

3.4. Чек-лист для мейнтейнера перед релизом

1. Убедиться, что версия в package.json обновлена ("version": "1.3.0").
2. Обновить CHANGELOG.md (описать новые фичи, исправления).
3. Проверить локальную сборку: npm run vscode:prepublish.
4. Закоммитить изменения и создать тег:
   ```bash
   git tag v1.3.0
   git push origin v1.3.0
   ```
5. Дождаться завершения GitHub Action и проверить наличие расширения в маркетплейсе.

3.5. Ручная публикация (на случай сбоя CI)

```bash
# Установка инструмента публикации
npm install -g @vscode/vsce

# Логин (потребуется Personal Access Token)
vsce login speq-tms

# Публикация
vsce publish
```

---

Этот план обеспечивает прозрачный процесс разработки и релиза, полностью интегрированный с существующей экосистемой Speq. Если нужны уточнения по реализации какого-то конкретного пункта (например, как именно парсить manifest.yaml для Quick Pick) — готов предоставить более детальные фрагменты кода.