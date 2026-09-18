/* Experimental ES5 track isolation. Not enabled in the TV application yet. */
(function (root) {
    'use strict';
    function uint32(b, p) {
        if (p < 0 || p + 4 > b.length) throw Error('Truncated integer');
        return b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
    }
    function boxes(b, start, end) {
        var out = [], p = start, size, type;
        while (p < end) {
            if (end - p < 8) throw Error('Truncated box');
            size = uint32(b, p);
            type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
            if (size === 1) throw Error('Extended box sizes are not supported');
            if (size === 0) size = end - p;
            if (size < 8 || size > end - p) throw Error('Invalid box size');
            out.push({start: p, end: p + size, type: type});
            p += size;
        }
        return out;
    }
    function children(b, box) { return boxes(b, box.start + 8, box.end); }
    function find(b, box, type) {
        var list = children(b, box), i;
        for (i = 0; i < list.length; i++) if (list[i].type === type) return list[i];
        throw Error('Missing ' + type);
    }
    function field(b, box, offset) {
        if (box.start + offset + 4 > box.end) throw Error('Truncated ' + box.type);
        return uint32(b, box.start + offset);
    }
    function trackId(b, trak) {
        var tkhd = find(b, trak, 'tkhd'), version = b[tkhd.start + 8];
        if (version !== 0 && version !== 1) throw Error('Unknown tkhd version');
        return field(b, tkhd, version === 1 ? 28 : 20);
    }
    function free(b, box) {
        // Keep byte offsets intact: trun data_offset still points to original mdat.
        b[box.start + 4] = 102; b[box.start + 5] = 114;
        b[box.start + 6] = 101; b[box.start + 7] = 101;
    }
    function write32(b, p, n) {
        b[p] = (n >>> 24) & 255; b[p + 1] = (n >>> 16) & 255;
        b[p + 2] = (n >>> 8) & 255; b[p + 3] = n & 255;
    }
    function join(parts) {
        var size = 0, i, p = 0;
        for (i = 0; i < parts.length; i++) size += parts[i].length;
        var out = new Uint8Array(size);
        for (i = 0; i < parts.length; i++) { out.set(parts[i], p); p += parts[i].length; }
        return out;
    }
    function compact(b, start, end) {
        var list = boxes(b, start, end), parts = [], i;
        for (i = 0; i < list.length; i++) {
            var box = list[i], out;
            if (box.type === 'free') continue;
            if (box.type === 'moov' || box.type === 'mvex' || box.type === 'moof' || box.type === 'traf') {
                out = join([b.subarray(box.start, box.start + 8), compact(b, box.start + 8, box.end)]);
                write32(out, 0, out.length);
                if (box.type === 'moof') {
                    var delta = out.length - (box.end - box.start), trafs = boxes(out, 8, out.length), j, k;
                    for (j = 0; j < trafs.length; j++) if (trafs[j].type === 'traf') {
                        var entries = children(out, trafs[j]);
                        for (k = 0; k < entries.length; k++) if (entries[k].type === 'trun') {
                            var trun = entries[k];
                            if (!(field(out, trun, 8) & 1)) throw Error('Explicit trun offset required');
                            write32(out, trun.start + 16, field(out, trun, 16) + delta);
                        }
                    }
                }
            } else if (box.type === 'tfdt' && b[box.start + 8] === 0) {
                out = new Uint8Array(20);
                out.set(b.subarray(box.start, box.start + 12));
                write32(out, 0, 20); out[8] = 1;
                write32(out, 16, field(b, box, 12));
            } else out = b.subarray(box.start, box.end);
            parts.push(out);
        }
        return join(parts);
    }
    function tracks(input) {
        var b = new Uint8Array(input), top = boxes(b, 0, b.length), result = [], i, j;
        for (i = 0; i < top.length; i++) if (top[i].type === 'moov') {
            var list = children(b, top[i]);
            for (j = 0; j < list.length; j++) if (list[j].type === 'trak') {
                var mdia = find(b, list[j], 'mdia'), hdlr = find(b, mdia, 'hdlr');
                var handler = field(b, hdlr, 16);
                result.push({id: trackId(b, list[j]), type: handler === 0x736f756e ? 'audio' : handler === 0x76696465 ? 'video' : 'other'});
            }
        }
        return result;
    }
    function packMedia(b) {
        var top = boxes(b, 0, b.length), result = [], i;
        for (i = 0; i < top.length; i++) {
            var box = top[i];
            if (box.type !== 'moof') { result.push(b.subarray(box.start, box.end)); continue; }
            var mdat = top[i + 1];
            if (!mdat || mdat.type !== 'mdat') throw Error('Expected adjacent mdat');
            var traf = find(b, box, 'traf'), tfhd = find(b, traf, 'tfhd');
            var flags = field(b, tfhd, 8), cursor = 16, defaultSize = 0;
            if (flags & 2) cursor += 4;
            if (flags & 8) cursor += 4;
            if (flags & 16) defaultSize = field(b, tfhd, cursor);
            var entries = children(b, traf), payload = [], total = 0, j, n;
            for (j = 0; j < entries.length; j++) if (entries[j].type === 'trun') {
                var run = entries[j], runFlags = field(b, run, 8), count = field(b, run, 12);
                if (!(runFlags & 1)) throw Error('Explicit trun offset required');
                var offset = box.start + (field(b, run, 16) | 0), length = 0;
                cursor = 20 + ((runFlags & 4) ? 4 : 0);
                var stride = ((runFlags & 256) ? 4 : 0) + ((runFlags & 512) ? 4 : 0) + ((runFlags & 1024) ? 4 : 0) + ((runFlags & 2048) ? 4 : 0);
                if (count > 100000 || run.start + cursor + count * stride > run.end) throw Error('Invalid sample table');
                for (n = 0; n < count; n++) {
                    var size = (runFlags & 512) ? field(b, run, cursor + ((runFlags & 256) ? 4 : 0)) : defaultSize;
                    if (!size) throw Error('Missing sample size');
                    length += size; cursor += stride;
                }
                if (offset < mdat.start + 8 || offset + length > mdat.end) throw Error('Sample outside mdat');
                payload.push(b.subarray(offset, offset + length));
                write32(b, run.start + 16, box.end - box.start + 8 + total);
                total += length;
            }
            var header = new Uint8Array([0,0,0,0,109,100,97,116]);
            write32(header, 0, 8 + total);
            result.push(b.subarray(box.start, box.end), header, join(payload));
            i++;
        }
        return join(result);
    }
    function isolate(input, id) {
        var b = new Uint8Array(input.length), top, i, j, k;
        b.set(input); top = boxes(b, 0, b.length);
        for (i = 0; i < top.length; i++) {
            if (top[i].type !== 'moov' && top[i].type !== 'moof') continue;
            var list = children(b, top[i]);
            for (j = 0; j < list.length; j++) {
                var box = list[j];
                if (box.type === 'trak' && trackId(b, box) !== id) free(b, box);
                if (box.type === 'mvex') {
                    var entries = children(b, box);
                    for (k = 0; k < entries.length; k++) if (entries[k].type === 'trex' && field(b, entries[k], 12) !== id) free(b, entries[k]);
                }
                if (box.type === 'traf') {
                    var tfhd = find(b, box, 'tfhd'), flags = field(b, tfhd, 8) & 0xffffff;
                    // Explicit moof-relative addressing is required; implicit bases may
                    // depend on the other traf and are unsafe to remove this way.
                    if (!(flags & 0x020000) || (flags & 1)) throw Error('Unsupported fragment data base');
                    if (field(b, tfhd, 12) !== id) free(b, box);
                }
            }
        }
        return packMedia(compact(b, 0, b.length));
    }
    var api = {tracks: tracks, isolate: isolate};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Fmp4TrackIsolation = api;
}(this));
