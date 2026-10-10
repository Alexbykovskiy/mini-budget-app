# My Apps — аудит Firebase и порядок перехода

Проверено 10 октября 2026. Проект `minibudget-4e474`, единственный владелец `BQbwiHs1Y3Wsz1yaT2JizWVWOLG2`.

**Новые правила не опубликованы.** Текущие правила `allow read, write: if true`, предоставленные владельцем, остаются публичными. Клиентская проверка UID закрывает интерфейс, но серверная защита появится только после отдельной публикации `firestore.rules`.

## Карта обращений

Все перечисленные пути относятся к одному проекту. Имена коллекций, ID и форматы существующих документов сохранены.

| Приложение | Чтение | Запись | Фоновые обращения и последствия закрытия публичного доступа |
| --- | --- | --- | --- |
| Mini Budget | `users/mini/expenses`, `users/mini/tags`, `users/mini/reminders`, `envelopes` | CRUD расходов и напоминаний, сохранение tags, транзакции остатка MiniBudget в `envelopes` | Snapshot расходов и напоминаний; загрузка тегов при старте. Без Auth перестали бы работать статистика, журнал, напоминания и списание из конверта. |
| Tattoo Finance | `incomes`, `expenses`, `studios`, `trips` | CRUD во всех четырёх коллекциях, batch/transactions для поездок | Загрузка студий, поездок, истории и статистики при старте; обновления после действий. Транспорт внутри приложения сохранён. |
| Конверты | `envelopes`, `transactions` | CRUD конвертов, журнал операций, batch/transactions распределения и переносов | Создание отсутствующих системных конвертов; перенос остатков первого числа. Эти существующие функции запускаются только после подтверждения владельца. |
| Tattoo CRM | `TattooCRM/app/clients`, `reminders`, `supplies`, `marketing`, `summary`; `clients/{id}/statusLogs`; `TattooCRM/settings/global/default`; старый корневой `clients` | CRUD перечисленных коллекций CRM, настройки, журналы статусов и поля Google Calendar; корневой `clients` только читается | Snapshot клиентов, напоминаний, расходников, маркетинга, затрат и журналов; загрузка настроек; Drive/Calendar синхронизация и обновление OAuth-токена. Без Auth недоступны все данные CRM и сохранение ссылок календаря. |
| Budget Control | собственные коллекции ниже; источники `users/mini/expenses`, `incomes` | Только собственное пространство владельца | Snapshot плана, своих операций и источников по диапазону дат; транзакционная инициализация настроек, подтверждение платежей и экспорт. Исходные расходы не копируются. |
| My Apps (`index.html`) | Нет Firebase | Нет | Статическое меню, manifest и service worker. Финансовых данных нет. |
| Free Day Editor | Нет Firebase | Нет | Расчёты и интерфейс без Firestore. Изменений авторизации не требует. |
| `TattooCRM/oauth-callback.html` | Нет Firebase | Нет | Существующая заглушка возвращает в защищённый CRM. Не используется как Firebase redirect helper. |

Точные пути CRM: `TattooCRM/app/{clients,reminders,supplies,marketing,summary}/{id}`, `TattooCRM/app/clients/{id}/statusLogs/{log}`, `TattooCRM/settings/global/default`. Старый `clients/{id}` разрешён владельцу только для чтения.

Budget Control: `budgetControl/{ownerUid}/{settings,transactions,recurring,payments,links,plans}/{id}`. `settings/main` хранит план; payments/links/plans не разрешают изменение уже созданной истории. `budgetControlAccess` закрыт; прежняя allowlist больше не нужна. Неизвестные пути, другие UID и создание произвольного `users/{uid}` запрещены.

Исходный адаптер профессиональных расходов `expenses` сохранён: он исключает `Транспорт` только при агрегировании. Подписка на профессиональные расходы остаётся отключена в версии Budget Control 1.0 согласно первоначальному заданию; это явно показано в интерфейсе. Tattoo Finance продолжает учитывать все категории.

## Общая авторизация

`shared/firebase-config.js` — единый публичный конфиг и UID. `shared/auth.js` использует default Firebase app, Google provider и стандартную LOCAL persistence. На одном origin приложения разделяют сессию; на разных origin повторный вход возможен и ожидаем. Пароли и Firebase токены вручную не сохраняются.

Защищённые страницы скрыты уже в HTML до выполнения JavaScript. Рабочие скрипты загружаются последовательно только после подтверждения UID. Ошибка/отсутствие Auth оставляет страницу закрытой; финансовые профили посторонним не создаются. Другой UID получает «Нет доступа» и возможность сменить аккаунт.

`shared/owner-access.js` дополнительно проверяет UID на каждом обращении compat Firestore, включая batch commit и callback транзакции, отписывает snapshot при потере сессии и отбрасывает запоздалые ответы. Выход блокирует интерфейс сразу, затем завершает общую сессию и перезагружает страницу. Возврат из BFCache повторно проверяет доступ. Защитный код дополняет серверные Rules, не заменяет их.

CRM больше не использует отдельный Google popup/автоматический redirect для Firebase и не меняет общую persistence. Drive/Calendar остаются отдельной интеграцией Google Identity Services с существующими scope; подключение доступно кнопкой в шапке. Access token остаётся в памяти; старый ключ `gAccessToken` удаляется. Финансовые кеши не удаляются.

SDK 12.19.0 сохранён из официального CDN в `shared/vendor/12.19.0`; worker кеширует эти статические файлы, чтобы восстановление локальной сессии не зависело от CDN. Firestore использует память, постоянный дисковый кеш облачных финансов не включается. В WebKit включён поддерживаемый long polling для предотвращения зависания WebChannel. Локальные данные Budget Control сохраняются; их можно открыть после входа, не копируя в облако.

## Домен и iOS

Authorized Domains прочитаны через официальный `identitytoolkit.googleapis.com/v1/projects?key=...`: `localhost`, `minibudget-4e474.firebaseapp.com`, `minibudget-4e474.web.app`, `alexbykovskiy.github.io`, `alexbykovskiy.com`, `www.alexbykovskiy.com`. Настройки не изменены. Для настоящего Google-входа локально использовать **localhost**, а не 127.0.0.1.

На текущем GitHub Pages вход использует `signInWithPopup` непосредственно из клика. При закрытии/блокировке окна есть понятное сообщение и повторный вход. Email/Password отсутствует.

Redirect выключен: GitHub Pages не предоставляет Firebase `/__/auth` helpers на origin приложения. Автоматического fallback на несовместимый redirect нет. Для его включения сначала настроить Firebase Hosting на домене приложения либо официальный reverse proxy `/__/auth`, `/__/firebase` (не HTTP 302), установить этот host как `authDomain`, проверить Authorized Domains и OAuth redirect URI `https://<host>/__/auth/handler`. Затем включить `redirectEnabled`. Код дополнительно требует HTTPS и совпадения origin/authDomain, обрабатывает `getRedirectResult` и показывает отдельную кнопку. Worker не кеширует auth endpoints.

Источники: [Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin), [redirect и блокировка стороннего хранилища](https://firebase.google.com/docs/auth/web/redirect-best-practices), [persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [WebChannel long polling](https://firebase.google.com/docs/reference/js/firestore.firestoresettings).

Проверка WebKit на Windows не подтверждает поведение установленного Safari/PWA на физических iPhone 14 Pro Max и iPad Pro 12,9. Они входят в обязательную проверку перед закрытием правил.

## Порядок выпуска — не менять местами

1. Опубликовать исходники общей Auth и пяти приложений, оставив серверные Rules пока прежними. Обновить все старые вкладки и установленный PWA; убедиться, что загружается новая версия worker и общий gate.
2. Войти существующим Google-аккаунтом владельца на каждом используемом origin. Проверить Mini Budget, Tattoo Finance, Конверты, CRM и Budget Control, затем общий выход/переходы/перезапуск. Пройти сценарии Chrome, Safari и установленных iPhone/iPad PWA. Не выполнять массовые удаления или миграции данных.
3. Проверить собственные реальные записи и статистику, поездки/студии, напоминания, отдельное подключение Drive/Calendar. Проверить другую Google-учётную запись и отсутствие финансового интерфейса. Подтвердить UID владельца.
4. Только после успешных проверок отдельно опубликовать корневой `firestore.rules` в проект `minibudget-4e474`. Этот этап в текущей работе **не выполнялся**. Проверить owner/guest/foreign доступ ещё раз; не возвращать публичные Rules при ошибке клиента.

Никаких переносов существующих коллекций, изменения ID или автоматического импорта локальных операций в облако не предусмотрено. Budget Control создаёт настройки только в своём новом пространстве, если документа ещё нет.

В исходном Mini Budget есть вызов `firebase.storage()` для фото напоминания, но Firebase Storage SDK не подключён в HTML. Эта ранее существовавшая проблема отмечена отдельно: изменение Storage Rules/обработка старых download URL сюда не включены. CRM хранит фотографии через Google Drive. Правила этого релиза относятся к Firestore.

Полученный файл задания обрывается после «Использовать уже реализ…» в разделе Budget Control. Выполнены требования доступной части и сохранена спецификация ранее реализованной версии 1.0.
