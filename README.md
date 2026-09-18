# SmartTV Twitch — Old Tizen

This fork fixes Twitch live playback on an older Samsung Tizen TV. Channels that enable 1440p may deliver even their 720p and 1080p variants as fragmented MP4 (fMP4), which the legacy native player on the tested TV could not play. The app uses hls.js and MediaSource, separates the H.264 video and AAC audio fragments on the TV, and feeds them to separate media buffers. It does not transcode the stream or require a PC relay.

**This enables up to 1080p on tested 1440p-enabled channels; it does not add 1440p playback.**

**Tested device:** Samsung UE50KU6000 (KU6000 series), Tizen 2.4.0, firmware T-JZL6DEUC-1260.1. The owner confirmed live picture and sound on `rdulive` and `silvername`, channel search, quality switching, Twitch account authorization, and the app without the on-screen diagnostics overlay. No other TV model has been confirmed.

| | |
|---|---|
| App name | Twitch Old Tizen |
| Package version | 4.0.4 |
| License | GPL-3.0; see [LICENSE](LICENSE) and upstream notices |
| Language | [Русская версия](README_RU.md) |
| Release | [Download the re-signable WGT](https://github.com/numbereleven-a/smarttv-twitch-old-tizen/releases/latest) |

## Install

Download the `resign-required.wgt` asset from the latest release. Its Samsung signature files were intentionally removed, so it cannot be installed as downloaded. [Import the WGT as an existing Tizen project](https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications/importing-tv-applications.html), select a Samsung certificate profile that includes your TV's DUID, and build a newly signed WGT. You can also clone this repository and build from source. Follow Samsung's [TV application signing guide](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html). This app is not distributed through Samsung Apps.

## Requirements and compatibility

The confirmed configuration is the KU6000/Tizen 2.4.0 above. The app needs a Samsung Tizen Web Application runtime with working MediaSource (MSE), separate H.264/AVC and AAC MP4 SourceBuffers, hardware decoding for the selected rendition, and network access to Twitch's APIs and stream CDN. The tested live renditions used H.264 and AAC. The TV must also accept a WGT signed for that device.

The app manifest's Tizen 2.3 minimum is an installation declaration, not proof of playback on every Tizen 2.3 TV. Other models, chipsets, firmware versions, codecs, sustained playback durations, and resolutions have not been verified. A positive `MediaSource.isTypeSupported()` result alone does not establish compatibility.

The remuxer handles the multiplexed Twitch fMP4 layout validated during development. It is not a general-purpose MP4 parser; unsupported fragment layouts, encryption, and 1440p output are not claimed to work.

## Changes in this fork

- Filters the available live renditions to H.264 at or below 1920×1080 and starts with a 720p preference.
- Uses hls.js/MSE instead of the old native HLS route for the live stream.
- Splits multiplexed fMP4 audio/video, removes the other track's fragment data, and preserves encoded packet payloads and timestamps. No re-encoding is performed.
- Adds ES5-era compatibility fixes required by the tested Tizen Web Runtime.
- Fixes live-video placement and loading-indicator dismissal during playback.
- Guards chat parsing against malformed emote and system-message data.
- Keeps diagnostics in the JavaScript console without covering the video.

The base player is [fgl27/smarttv-twitch](https://github.com/fgl27/smarttv-twitch), including its HLS/MSE work from [PR #328](https://github.com/fgl27/smarttv-twitch/pull/328). The upstream issue describing the older-TV failure is [#316](https://github.com/fgl27/smarttv-twitch/issues/316). Upstream copyright and license notices are retained.

## Build

This is a Tizen Web Application project. Install Tizen Studio with the Samsung TV extension and certificate tools, select a Samsung certificate profile, then use the Tizen CLI:

```text
tizen build-web -- app
tizen package -t wgt -s YOUR_CERTIFICATE_PROFILE -- app/.buildResult
```

For installation, enable Developer Mode on the TV, connect it as a Tizen device, permit installation, then install the WGT using Tizen Studio. See Samsung's [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## Authentication

The original Twitch account authorization flow is retained. The owner confirmed that authorization succeeds in this fork. The app uses the scopes and authorization process documented by the upstream project; consult its [authentication guide](https://github.com/fgl27/smarttv-twitch#twitchtv-authentication-key).
