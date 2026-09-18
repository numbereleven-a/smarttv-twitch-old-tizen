# SmartTV Twitch — Old Tizen

This fork fixes Twitch live playback on an older Samsung Tizen TV. Channels that enable 1440p may deliver even their 720p and 1080p variants as fragmented MP4 (fMP4), which the legacy native player on the tested TV could not play. The app uses hls.js and MediaSource, separates the H.264 video and AAC audio fragments on the TV, and feeds them to separate media buffers.

**This enables up to 1080p on tested 1440p-enabled channels; it does not add 1440p playback.**

**Tested device:** Samsung UE50KU6000 (KU6000 series), Tizen 2.4.0, firmware T-JZL6DEUC-1260.1. No other TV model has been confirmed.

| | |
|---|---|
| App name | Twitch Old Tizen |
| Package version | 4.0.4 |
| License | GPL-3.0; see [LICENSE](LICENSE) and upstream notices |
| Language | [Русская версия](README_RU.md) |
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

## Requirements and compatibility

The confirmed configuration is the KU6000/Tizen 2.4.0 above. The app needs a Samsung Tizen Web Application runtime with working MediaSource (MSE), separate H.264/AVC and AAC MP4 SourceBuffers, hardware decoding for the selected rendition, and network access to Twitch's APIs and stream CDN. The tested live renditions used H.264 and AAC. The TV must also accept a WGT signed for that device.

The app manifest's Tizen 2.3 minimum is an installation declaration, not proof of playback on every Tizen 2.3 TV. Other models, chipsets, firmware versions, codecs, sustained playback durations, and resolutions have not been verified. A positive `MediaSource.isTypeSupported()` result alone does not establish compatibility.

The remuxer handles the multiplexed Twitch fMP4 layout validated during development. It is not a general-purpose MP4 parser; unsupported fragment layouts, encryption, and 1440p output are not claimed to work.

## Upstream project

The base player is [fgl27/smarttv-twitch](https://github.com/fgl27/smarttv-twitch), including its HLS/MSE work from [PR #328](https://github.com/fgl27/smarttv-twitch/pull/328). The upstream issue describing the older-TV failure is [#316](https://github.com/fgl27/smarttv-twitch/issues/316). Upstream copyright and license notices are retained.

## Build

This is a Tizen Web Application project. Install Tizen Studio with the Samsung TV extension and certificate tools, select a Samsung certificate profile, then use the Tizen CLI:

```text
tizen build-web -- app
tizen package -t wgt -s YOUR_CERTIFICATE_PROFILE -- app/.buildResult
```

For installation, enable Developer Mode on the TV, connect it as a Tizen device, permit installation, then install the WGT using Tizen Studio. See Samsung's [TV device setup](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## Authentication

The original Twitch account authorization flow is retained. The app uses the scopes and authorization process documented by the upstream project; consult its [authentication guide](https://github.com/fgl27/smarttv-twitch#twitchtv-authentication-key).
