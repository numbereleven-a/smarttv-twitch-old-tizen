var PlaybackDiagnostics = (function () {
    var lines = [], enabled = false, overlay = null, timer = null;
    function render() {
        if (!enabled) return;
        overlay.style.display = (Play_isOn || PlayVod_isOn || PlayClip_isOn) ? 'block' : 'none';
        overlay.textContent = 'Playback debug | MSE: ' + (typeof MediaSource !== 'undefined') + ' | Hls: ' + (typeof Hls === 'undefined' ? 'unavailable' : Hls.version) + '\n' +
            Play_GetDiagnosticStatus() + '\n' + lines.join('\n');
    }
    function show(text) {
        if (!enabled) return;
        text = String(text).replace(/https?:\/\/[^\s"']+/g, '[URL]').replace(/(?:token|sig|oauth|authorization)\s*[=:]\s*[^\s,;]+/gi, '[redacted]');
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
        show('JS error: ' + file + ':' + event.lineno + ':' + (event.colno || 0) + ' ' + (event.message || (event.error && event.error.message) || 'Error'));
    });
    window.addEventListener('load', function () {
        show('MSE: ' + (typeof MediaSource !== 'undefined') + ', Hls: ' + (typeof Hls === 'undefined' ? 'NOT LOADED' : Hls.version));
    });
    return show;
}());
