# SmartTV Twitch — Old Tizen

[README на русском](README_RU.md)

This fork fixes Twitch live playback on older Samsung Tizen TVs. Channels that enable 1440p may deliver even their 720p and 1080p variants as fragmented MP4 (fMP4), which the legacy native player may not play. The app uses hls.js and MediaSource. On Tizen 2.4 it separates H.264 video and AAC audio into separate media buffers. On Tizen 3.0 it converts fMP4 fragments to MPEG-TS before hls.js remuxes them into MP4 accepted by the TV.

**This enables up to 1080p on tested 1440p-enabled channels; it does not add 1440p playback.**

**Tested devices:**

- Samsung UE50KU6000 (KU6000 series), Tizen 2.4.0, firmware T-JZL6DEUC-1260.1: playback confirmed in 4.0.9.
- Samsung UE32M5550AU (M5550 series), Tizen 3.0, firmware family T-KTSDEUC: HLS playback tested with the fMP4-to-TS patch included in 4.1.

| | |
|---|---|
| App name | Twitch Old Tizen |
| Release / package version | 4.1 / 4.1.0 |
| License | GPL-3.0; see [LICENSE](LICENSE) and upstream notices |
| Release | [Download the installation package](https://github.com/numbereleven-a/smarttv-twitch-old-tizen/releases/latest) |

## Install

The release ZIP contains a WGT with its original Samsung signature files removed. A Samsung distributor certificate is tied to the target TV's DUID, so the downloaded WGT must be signed for your own television before it can be installed.

1. Download the ZIP from the [latest release](https://github.com/numbereleven-a/smarttv-twitch-old-tizen/releases/latest) and extract the WGT whose name ends in `-resign-required.wgt`.
2. Install Tizen Studio with the Samsung TV extension and Certificate Manager.
3. Enable Developer Mode on the TV, connect it to Tizen Studio, and create a Samsung certificate profile that includes the TV's DUID. Follow Samsung's [certificate guide](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html) and [TV connection guide](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
4. [Import the extracted WGT as an existing Tizen project](https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications/importing-tv-applications.html).
5. Select your Samsung certificate profile and build a new signed WGT.
6. Install that newly signed WGT on the connected TV through Tizen Studio.

You can alternatively clone this repository and build from source. The app is not distributed through Samsung Apps.

### Updating an existing installation

Version 4.1 keeps the application identifiers used by 4.0.5 through 4.0.10. Sign the update with the same author certificate and install it over the existing application without uninstalling it. This preserves its saved account and settings; an expired or revoked Twitch authorization may still require signing in again. Keep a backup of your author certificate. Version 4.0.4 remains a separate application and its account data is not transferred to this application.

## Player controls

- **Reload:** on the live player panel, press Right from Play/Pause and select Reload. It restarts the current channel with fresh playback data while retaining the selected quality. Reload is also available in the live playback error dialog.
- **Live delay:** the panel displays an approximate delay such as `LIVE · ~8 s` for HLS live playback. This measures distance from the available HLS live edge, not total camera-to-TV latency. No value is displayed for Native playback or when the estimate is unavailable. Reload starts a fresh session near the live edge; it cannot remove Twitch's delivery delay.
- **Automatic startup retry:** a live playback failure before playback starts triggers one automatic Reload. A second failure shows the error dialog. Errors remain in the in-memory debug history; playback that has already started is not automatically reloaded.
- **To live:** press Right twice from Play/Pause to select To live. It is available only for HLS live playback, including Auto when it selected HLS. It refreshes the playlist and seeks to the live sync position without restarting the channel.
- **HLS live pause:** pauses the video and stream loading to keep the frame still. Play resumes loading from the paused position; hls.js may return to live if that position has left the available stream window.
- **Loading status:** the spinner shows the current loading stage, including format detection, Native startup, HLS fallback and the automatic retry.
- **Active player:** the panel shows HLS, Native or Video. In Auto mode it shows the selected backend, such as `Auto · HLS`.
- **Playback debug log:** in Settings, under Player settings, enable Playback debug log to show the app version, TV model, Tizen version, player state, buffers and recent errors. The overlay is off by default. The last five errors are kept in memory even while the overlay is off, with date and time from the TV clock, stage, code and exception text when available. They remain visible after Reload but are cleared when the app closes. Playback URLs and authorization tokens are redacted. No error file is created.

The live stream player has three modes:

- **HLS:** hls.js/MSE for all channels on an MSE-capable TV.
- **Auto (default for new installations):** checks the rendition playlist, selects HLS for streams with an initialization map (including Twitch fMP4), and starts ordinary streams through Samsung AVPlay. If Native fails or does not complete preparation within the configured Native start timeout (15 seconds by default), Auto switches to HLS when MSE is available.
- **Native start timeout (seconds):** choose 10, 15, 20 or 30 seconds in Player settings. The value applies to the next Native playback start; it does not change the LIVE delay.
- **Native:** forces Samsung AVPlay. It does not silently switch to HLS. Unsupported streams show an error suggesting HLS or Auto.

The previous Native-with-fallback preference becomes Auto on update. An existing HLS preference remains HLS.

## Requirements and compatibility

The confirmed configurations are listed above. The app needs a Samsung Tizen Web Application runtime with working MediaSource (MSE), separate H.264/AVC and AAC MP4 SourceBuffers, hardware decoding for the selected rendition, and network access to Twitch's APIs and stream CDN. The tested live renditions used H.264 and AAC. The TV must also accept a WGT signed for that device.

The new fMP4-to-TS fragment loader is enabled only on Tizen 3 and later. On Tizen 2.4, hls.js keeps its original loader and the existing fMP4 buffer separation. Offline checks cover both latency profiles and the conversion path; they do not replace a physical Tizen 2.4 test. The Tizen 3 fix skips LL-HLS parts; those parts retain the original fMP4 path.

The app remembers the last live quality explicitly selected by the user. The initial preference on first launch is 720p.

The app manifest's Tizen 2.3 minimum is an installation declaration, not proof of playback on every Tizen 2.3 TV. Other models, chipsets, firmware versions, codecs, sustained playback durations, and resolutions have not been verified. A positive `MediaSource.isTypeSupported()` result alone does not establish compatibility.

The remuxer handles the multiplexed Twitch fMP4 layout validated during development. It is not a general-purpose MP4 parser; unsupported fragment layouts, encryption, and 1440p output are not claimed to work.

## Upstream project

The base player is [fgl27/smarttv-twitch](https://github.com/fgl27/smarttv-twitch), including its HLS/MSE work from [PR #328](https://github.com/fgl27/smarttv-twitch/pull/328). The upstream issue describing the older-TV failure is [#316](https://github.com/fgl27/smarttv-twitch/issues/316). Upstream copyright and license notices are retained.

The Tizen 3 fMP4-to-TS converter comes from [psulek/smarttv-twitch-tizen3](https://github.com/psulek/smarttv-twitch-tizen3), under GPL-3.0.

## Build

This is a Tizen Web Application project. Install Tizen Studio with the Samsung TV extension and certificate tools, select a Samsung certificate profile, then use the Tizen CLI:

```text
tizen build-web -- app
tizen package -t wgt -s YOUR_CERTIFICATE_PROFILE -- app/.buildResult
```

For installation, enable Developer Mode on the TV, connect it as a Tizen device, permit installation, then install the WGT using Tizen Studio. See Samsung's [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## Authentication

The original Twitch account authorization flow is retained. The app uses the scopes and authorization process documented by the upstream project; consult its [authentication guide](https://github.com/fgl27/smarttv-twitch#twitchtv-authentication-key).
