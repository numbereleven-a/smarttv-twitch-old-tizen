/* Isolate multiplexed AVC/AAC fragments for legacy MSE implementations. */
function LegacyFmp4Buffers(player) {
    var trigger = player.trigger, tracks = null, appended = 0;
    function splitStreamInfo(owner) {
        var streams = owner && owner.elementaryStreams;
        if (streams && streams.audiovideo) {
            streams.audio = copy(streams.audiovideo);
            streams.video = copy(streams.audiovideo);
            streams.audiovideo = null;
        }
    }
    function copy(value) {
        var result = {}, key;
        for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
        return result;
    }
    player.trigger = function (event, data) {
        if (event === Hls.Events.MANIFEST_LOADING) tracks = null;
        if (tracks && event === Hls.Events.FRAG_PARSED) {
            splitStreamInfo(data.frag);
            splitStreamInfo(data.part);
        }
        if (event === Hls.Events.BUFFER_CODECS) {
            tracks = null;
            var combined = data.audiovideo;
            if (combined && combined.initSegment) {
                var found = Fmp4TrackIsolation.tracks(combined.initSegment);
                var codecs = (combined.codec || '').split(','), audioCodec, videoCodec, i;
                for (i = 0; i < codecs.length; i++) {
                    if (codecs[i].indexOf('mp4a') !== -1) audioCodec = codecs[i].trim();
                    if (codecs[i].indexOf('avc') !== -1) videoCodec = codecs[i].trim();
                }
                if (found.length === 2 && audioCodec && videoCodec && found[0].type !== found[1].type && found[0].type !== 'other' && found[1].type !== 'other') {
                    var replacement = {};
                    for (i = 0; i < found.length; i++) {
                        var track = copy(combined), type = found[i].type;
                        track.container = type + '/mp4';
                        track.codec = type === 'audio' ? audioCodec : videoCodec;
                        track.levelCodec = track.codec;
                        track.initSegment = Fmp4TrackIsolation.isolate(combined.initSegment, found[i].id);
                        replacement[type] = track;
                    }
                    tracks = found;
                    PlaybackDiagnostics('Live fMP4: separate audio/video buffers');
                    return trigger.call(player, event, replacement);
                }
            }
        }
        if (event === Hls.Events.BUFFER_APPENDING && tracks && data.type === 'audiovideo') {
            splitStreamInfo(data.frag);
            splitStreamInfo(data.part);
            // Prepare both before emitting either, so a parse failure cannot append half a fragment.
            var jobs = [], j;
            for (j = 0; j < tracks.length; j++) {
                var job = copy(data);
                job.type = tracks[j].type;
                job.data = Fmp4TrackIsolation.isolate(data.data, tracks[j].id);
                jobs.push(job);
            }
            for (j = 0; j < jobs.length; j++) trigger.call(player, event, jobs[j]);
            return;
        }
        if (tracks && event === Hls.Events.BUFFER_APPENDED && data.timeRanges && ++appended % 20 === 0) {
            var names = ['audio', 'video'], n;
            for (n = 0; n < names.length; n++) {
                var ranges = data.timeRanges[names[n]];
                if (ranges) PlaybackDiagnostics(names[n] + ' ranges=' + ranges.length + (ranges.length ? ' end=' + ranges.end(ranges.length - 1).toFixed(2) : ''));
            }
        }
        return trigger.apply(player, arguments);
    };
}
