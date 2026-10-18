/* hls.js fragment loader (config.fLoader) that converts Twitch fMP4 fragments to MPEG-TS on the fly.
 *
 * Tizen 3.0 (2017, AppleWebKit/538.1) MSE accepts MPEG-TS but fails to decode Twitch's fMP4
 * (MEDIA_ERR_DECODE / video error 3), even when audio and video are in separate SourceBuffers.
 * hls.js plays MPEG-TS with its own TS demuxer and MP4 remuxer, and that this TV's MSE does accept,
 * so every fMP4 fragment is converted here (general/PlayHlsRemux.js) before hls.js sees it. hls.js
 * probes fragment data, detects TS and switches to its TS path automatically.
 *
 * Only fragments are converted; the init segment (EXT-X-MAP) is kept as is because the conversion
 * needs it (SPS/PPS and the AAC configuration) and the TS path builds its own init segment.
 *
 * Ported from PlayHls_FragmentLoader of psulek/smarttv-twitch-tizen3 (GPL v3).
 */
var Fmp4ToTs_counters = {};

function Fmp4ToTs_count(name) {
    Fmp4ToTs_counters[name] = (Fmp4ToTs_counters[name] || 0) + 1;
}

function Fmp4ToTs_report(text) {
    if (typeof PlaybackDiagnostics !== 'function') return;
    var counts = '', key;
    for (key in Fmp4ToTs_counters) {
        if (Object.prototype.hasOwnProperty.call(Fmp4ToTs_counters, key)) counts += key + '=' + Fmp4ToTs_counters[key] + ' ';
    }
    PlaybackDiagnostics('fMP4->TS ' + text + ' [' + counts + ']');
}

function Fmp4ToTs_copy(value) {
    var result = {}, key;
    for (key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
    }
    return result;
}

function Fmp4ToTsLoader(config) {
    // hls.js reads the loader stats object right after constructing the loader
    this.loader = new Hls.DefaultConfig.loader(config);
    this.stats = this.loader.stats;
    this.context = null;
}

Fmp4ToTsLoader.prototype.load = function (context, config, callbacks) {
    var frag = context.frag,
        wrapped = Fmp4ToTs_copy(callbacks);

    this.context = context;

    wrapped.onSuccess = function (response, stats, loaderContext, networkDetails) {
        // Skip the init segment (EXT-X-MAP) and LL-HLS parts, a part is only a byte range of a fragment.
        if (frag && !context.part && frag.sn !== 'initSegment' && frag.initSegment && frag.initSegment.data && response.data) {
            try {
                var info = PlayHlsRemux_GetInit(frag.initSegment.data);
                var input = response.data instanceof Uint8Array ? response.data : new Uint8Array(response.data);
                var ts = info && PlayHlsRemux_FragmentToTs(input, info);

                if (ts) {
                    Fmp4ToTs_counters.bytes = (Fmp4ToTs_counters.bytes || 0) + ts.length;
                    Fmp4ToTs_count('ok');
                    response.data = ts.buffer;
                    if (Fmp4ToTs_counters.ok <= 3) Fmp4ToTs_report('fragment ' + input.length + 'B -> ' + ts.length + 'B');
                } else {
                    Fmp4ToTs_count('empty');
                    Fmp4ToTs_report('no samples in ' + input.length + 'B fragment, keeping fMP4');
                }
            } catch (e) {
                // Keep the fMP4 data: LegacyFmp4Buffers is the fallback for such a fragment
                Fmp4ToTs_count('error');
                Fmp4ToTs_report('conversion failed, keeping fMP4: ' + ((e && e.message) || String(e)));
            }
        }

        callbacks.onSuccess(response, stats, loaderContext, networkDetails);
    };

    this.loader.load(context, config, wrapped);
};

Fmp4ToTsLoader.prototype.abort = function () {
    this.loader.abort();
};

Fmp4ToTsLoader.prototype.destroy = function () {
    this.loader.destroy();
};

Fmp4ToTsLoader.prototype.getCacheAge = function () {
    return this.loader.getCacheAge ? this.loader.getCacheAge() : null;
};

Fmp4ToTsLoader.prototype.getResponseHeader = function (name) {
    return this.loader.getResponseHeader ? this.loader.getResponseHeader(name) : null;
};

// hls.js loader for Play_GetHlsConfig. Returns undefined on Tizen < 3, where the native path
// (raw fMP4 split by LegacyFmp4Buffers) is known to work and must not change.
function Play_GetHlsFragmentLoader() {
    if (typeof PlayHlsRemux_FragmentToTs === 'undefined' || typeof Fmp4ToTsLoader === 'undefined') return undefined;
    if (typeof Play_TizenVersion === 'undefined' || !(parseFloat(Play_TizenVersion) >= 3)) return undefined;
    return Fmp4ToTsLoader;
}
