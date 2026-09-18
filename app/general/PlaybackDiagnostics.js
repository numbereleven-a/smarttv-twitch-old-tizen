var PlaybackDiagnostics = (function () {
    var lines = [];
    function show(text) {
        text = String(text).replace(/https?:\/\/[^\s"']+/g, '[URL]').replace(/(?:token|sig|oauth|authorization)\s*[=:]\s*[^\s,;]+/gi, '[redacted]');
        if (lines.length && lines[lines.length - 1] === text.slice(0, 350)) return;
        lines.push(text.slice(0, 350));
        if (lines.length > 10) lines.shift();
        if (window.console && console.log) console.log('[Playback]', text.slice(0, 350));
    }
    window.addEventListener('error', function (event) {
        var file = (event.filename || '').split('/').pop().split('?')[0];
        show('JS error: ' + file + ':' + event.lineno + ':' + (event.colno || 0) + ' ' + (event.message || (event.error && event.error.message) || 'Error'));
    });
    window.addEventListener('load', function () {
        show('MSE: ' + (typeof MediaSource !== 'undefined') + ', Hls: ' + (typeof Hls === 'undefined' ? 'NOT LOADED' : Hls.version));
    });
    return show;
}());
