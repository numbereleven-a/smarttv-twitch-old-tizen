# SmartTV Twitch — Old Tizen

Этот форк исправляет воспроизведение прямых трансляций Twitch на старом телевизоре Samsung Tizen. На каналах с включённым 1440p даже варианты 720p и 1080p могут передаваться в fragmented MP4 (fMP4), с которым не справлялся старый нативный плеер проверенного телевизора. Приложение использует hls.js и MediaSource, разделяет звук и видео на телевизоре и подаёт их в отдельные буферы.

**На проверенных каналах доступны варианты до 1080p. Воспроизведение 1440p не добавлено.**

**Проверенное устройство:** Samsung UE50KU6000 (серия KU6000), Tizen 2.4.0, прошивка T-JZL6DEUC-1260.1. Работа на других моделях не подтверждена.

| | |
|---|---|
| Название | Twitch Old Tizen |
| Версия пакета | 4.0.5 |
| Лицензия | GPL-3.0; см. [LICENSE](LICENSE) и уведомления исходного проекта |
| English | [README](README.md) |
| Релиз | [Скачать установочный пакет](https://github.com/numbereleven-a/smarttv-twitch-old-tizen/releases/latest) |

## Установка

В ZIP из релиза находится WGT, из которого удалены исходные файлы подписи Samsung. Сертификат дистрибьютора Samsung привязан к DUID целевого телевизора, поэтому перед установкой скачанный WGT необходимо подписать для своего телевизора.

1. Скачайте ZIP из [последнего релиза](https://github.com/numbereleven-a/smarttv-twitch-old-tizen/releases/latest) и извлеките WGT, имя которого заканчивается на `-resign-required.wgt`.
2. Установите Tizen Studio, Samsung TV Extension и Certificate Manager.
3. Включите Developer Mode на телевизоре, подключите его к Tizen Studio и создайте профиль сертификата Samsung с DUID телевизора. Следуйте [инструкции по сертификатам](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html) и [инструкции по подключению ТВ](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
4. [Импортируйте извлечённый WGT как существующий проект Tizen](https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications/importing-tv-applications.html).
5. Выберите свой профиль сертификата Samsung и соберите новый подписанный WGT.
6. Установите новый подписанный WGT на подключённый телевизор через Tizen Studio.

Также можно клонировать репозиторий и собрать приложение из исходников. Приложение не опубликовано в Samsung Apps.

## Требования и совместимость

Подтверждённая конфигурация — KU6000/Tizen 2.4.0 выше. Приложению необходимы среда веб-приложений Samsung Tizen с работающим MediaSource (MSE), отдельными MP4 SourceBuffer для H.264/AVC и AAC, аппаратное декодирование выбранного варианта и сеть с доступом к API и CDN Twitch. Проверенные прямые трансляции использовали H.264 и AAC. Телевизор должен принимать WGT, подписанный для его DUID.

Приложение запоминает последнее качество прямого эфира, явно выбранное пользователем. При первом запуске начальное предпочтение — 720p.

Минимум Tizen 2.3 в манифесте — требование к установке, но не подтверждение работы на всех телевизорах с Tizen 2.3. Другие модели, чипсеты, прошивки, кодеки, длительность просмотра и разрешения отдельно не проверялись. Положительный результат `MediaSource.isTypeSupported()` сам по себе не гарантирует воспроизведение.

Обработка рассчитана на структуру Twitch fMP4, проверенную при разработке. Это не универсальный MP4-конвертер. Поддержка шифрованных потоков и вывода 1440p не заявляется.

## Исходный проект

Основа — [fgl27/smarttv-twitch](https://github.com/fgl27/smarttv-twitch), в том числе работа HLS/MSE из [PR #328](https://github.com/fgl27/smarttv-twitch/pull/328). Проблема старых телевизоров описана в [issue #316](https://github.com/fgl27/smarttv-twitch/issues/316). Уведомления об авторских правах и лицензия исходного проекта сохранены.

## Сборка

Нужен проект веб-приложения Tizen, Tizen Studio с Samsung TV Extension и профиль сертификата Samsung:

```text
tizen build-web -- app
tizen package -t wgt -s YOUR_CERTIFICATE_PROFILE -- app/.buildResult
```

Для установки включите Developer Mode на телевизоре, подключите его к Tizen Studio, разрешите установку и установите WGT. См. [инструкцию Samsung по настройке ТВ](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## Авторизация

Сохранена штатная процедура авторизации Twitch из исходного проекта. О разрешениях и получении ключа читайте в [руководстве исходного проекта](https://github.com/fgl27/smarttv-twitch#twitchtv-authentication-key).
