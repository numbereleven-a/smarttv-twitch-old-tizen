var PlaybackDiagnostics = (function () {
    var lines = [], errors = [], enabled = false, overlay = null, timer = null, device = '';
    function validLabel(value) {
        return typeof value === 'string' && /^[A-Za-z0-9_. :()-]{1,80}$/.test(value);
    }
    // Remove the history saved by 4.0.7; current errors stay in memory only.
    try { localStorage.removeItem('playback_error_history'); } catch (ignore) {}
    function clean(text) {
        return String(text).replace(/https?:\/\/[^\s"']+/g, '[URL]')
            .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
            .replace(/(?:access_token|client_secret|token|sig|oauth|authorization)\s*["']?\s*[=:]\s*["']?[^\s,;"']+/gi, '[redacted]')
            .slice(0, 350);
    }
    function pad(value) { return ('0' + value).slice(-2); }
    function errorLine(item) {
        var date = new Date(item.time);
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
            pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + ' | ' + item.stage + ' | ' + item.code +
            (item.message ? '\n  ' + item.message : '');
    }
    function readDevice() {
        var version = 'unavailable', model = 'unavailable', platform = 'unavailable';
        try { version = tizen.application.getAppInfo().version; } catch (ignore) {}
        try { model = webapis.productinfo.getModel(); } catch (ignore) {}
        try { platform = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version'); } catch (ignore) {}
        return 'APP: ' + version + ' | TV: ' + model + ' | Tizen: ' + platform;
    }
    function render() {
        if (!enabled) return;
        overlay.style.display = (Play_isOn || PlayVod_isOn || PlayClip_isOn) ? 'block' : 'none';
        overlay.textContent = device + '\nPlayback debug | MSE: ' + (typeof MediaSource !== 'undefined') + ' | Hls: ' + (typeof Hls === 'undefined' ? 'unavailable' : Hls.version) + '\n' +
            Play_GetDiagnosticStatus() + '\n' + lines.join('\n') +
            (errors.length ? '\nLast errors (TV time):\n' + errors.map(errorLine).join('\n') : '');
    }
    show.error = function (stage, code, exception) {
        var message = exception ? (typeof exception === 'string' ? exception :
            (exception.name ? exception.name + ': ' : '') + (exception.message || '')) : '';
        errors.push({time: new Date().getTime(), stage: validLabel(stage) ? stage : 'Playback',
            code: validLabel(code) ? code : 'unknown', message: message ? clean(message) : ''});
        if (errors.length > 5) errors.shift();
        render();
    };
    function show(text) {
        if (!enabled) return;
        text = clean(text);
        if (lines.length && lines[lines.length - 1] === text.slice(0, 350)) return;
        lines.push(text.slice(0, 350));
        if (lines.length > 10) lines.shift();
        if (window.console && console.log) console.log('[Playback]', text.slice(0, 350));
        render();
    }
    show.setEnabled = function (value) {
        enabled = !!value;
        window.clearInterval(timer);
        timer = null;
        if (!enabled) {
            lines = [];
            if (overlay) overlay.style.display = 'none';
            return;
        }
        device = readDevice();
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'playback_debug';
            overlay.style.cssText = 'position:absolute;left:1%;bottom:1%;max-width:96%;padding:0.5em;background:rgba(0,0,0,0.8);color:white;font:2.1vh monospace;white-space:pre-wrap;word-wrap:break-word;z-index:100;pointer-events:none;';
            document.body.appendChild(overlay);
        }
        render();
        timer = window.setInterval(render, 1000);
    };
    window.addEventListener('error', function (event) {
        var file = (event.filename || '').split('/').pop().split('?')[0];
        var stage = /^[A-Za-z0-9_-]+\.js$/.test(file) ? 'JS ' + file + ':' + Number(event.lineno || 0) : 'JavaScript';
        show.error(stage, event.error && event.error.name ? event.error.name : 'Error', event.error || event.message);
        show('JS error: ' + file + ':' + event.lineno + ':' + (event.colno || 0) + ' ' + (event.message || (event.error && event.error.message) || 'Error'));
    });
    window.addEventListener('load', function () {
        show('MSE: ' + (typeof MediaSource !== 'undefined') + ', Hls: ' + (typeof Hls === 'undefined' ? 'NOT LOADED' : Hls.version));
    });
    return show;
}());
