//Variable initialization
//Converts Twitch fMP4 HLS fragments (H.264 + AAC muxed in one moof/mdat, low latency CMAF chunks) to MPEG-TS.
//Taken from psulek/smarttv-twitch-tizen3 (GPL v3, https://github.com/psulek/smarttv-twitch-tizen3),
//where this conversion is what makes fMP4 channels play on Tizen 3.0 TVs. Used by Fmp4ToTsLoader.js.
//The MSE of older TVs (Tizen 3.0) fails to decode Twitch fMP4 (video error 3, MEDIA_ERR_DECODE) even with separated
//audio/video buffers. The video track uses a 1000000 timescale, after ~71 minutes of stream the timestamps don't fit 32 bits.
//hls.js plays MPEG-TS with its own remuxer (separated buffers, 90kHz timescale, timestamps relative to the stream start).
//Used by PlayHls_FragmentLoader (PlayHls.js), a hls.js fLoader that converts every fragment after loading it.
var PlayHlsRemux_TS_PACKET = 188;
var PlayHlsRemux_PID_PMT = 0x1000;
var PlayHlsRemux_PID_VIDEO = 0x100;
var PlayHlsRemux_PID_AUDIO = 0x101;
var PlayHlsRemux_PTS_WRAP = 8589934592; // 2^33
var PlayHlsRemux_CrcTable = null;
var PlayHlsRemux_InitCache = { data: null, info: null };
var PlayHlsRemux_StartCode = new Uint8Array([0, 0, 0, 1]);
var PlayHlsRemux_Aud = new Uint8Array([0, 0, 0, 1, 0x09, 0xf0]);
//Variable initialization end

function PlayHlsRemux_U32(data, pos) {
    return data[pos] * 16777216 + (data[pos + 1] << 16) + (data[pos + 2] << 8) + data[pos + 3];
}

function PlayHlsRemux_I32(data, pos) {
    return (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
}

function PlayHlsRemux_Type(data, pos) {
    return String.fromCharCode(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
}

//returns the boxes of the given type (all if no type) between start and end: [{start, end, content}]
function PlayHlsRemux_Boxes(data, start, end, type) {
    var result = [],
        pos = start,
        size,
        header;

    while (pos + 8 <= end) {
        size = PlayHlsRemux_U32(data, pos);
        header = 8;
        if (size === 1) {
            size = PlayHlsRemux_U32(data, pos + 8) * 4294967296 + PlayHlsRemux_U32(data, pos + 12);
            header = 16;
        } else if (size === 0) size = end - pos;

        if (size < header || pos + size > end) break;

        if (!type || PlayHlsRemux_Type(data, pos + 4) === type) result.push({ start: pos, end: pos + size, content: pos + header });
        pos += size;
    }

    return result;
}

//follows a path of box types eg.: ['moov', 'trak'], returns all matching boxes of the last type
function PlayHlsRemux_Find(data, start, end, path) {
    var current = [{ content: start, end: end }],
        next,
        i,
        j;

    for (i = 0; i < path.length; i++) {
        next = [];
        for (j = 0; j < current.length; j++) next = next.concat(PlayHlsRemux_Boxes(data, current[j].content, current[j].end, path[i]));
        current = next;
    }

    return current;
}

function PlayHlsRemux_ParseAvcC(data, box) {
    var pos = box.content,
        result = { nalLengthSize: (data[pos + 4] & 3) + 1, sps: [], pps: [] },
        count,
        length,
        i;

    pos += 5;
    count = data[pos] & 0x1f;
    pos++;
    for (i = 0; i < count; i++) {
        length = (data[pos] << 8) | data[pos + 1];
        result.sps.push(data.subarray(pos + 2, pos + 2 + length));
        pos += 2 + length;
    }

    count = data[pos];
    pos++;
    for (i = 0; i < count; i++) {
        length = (data[pos] << 8) | data[pos + 1];
        result.pps.push(data.subarray(pos + 2, pos + 2 + length));
        pos += 2 + length;
    }

    return result;
}

//finds the AudioSpecificConfig inside the esds descriptors
function PlayHlsRemux_ParseEsds(data, box) {
    var pos = box.content + 4, // full box version + flags
        end = box.end,
        tag,
        size,
        headerEnd,
        flags;

    while (pos < end) {
        tag = data[pos];
        size = 0;
        headerEnd = pos + 1;
        //descriptor size uses 7 bits per byte, the high bit means more bytes follow
        do {
            size = (size << 7) | (data[headerEnd] & 0x7f);
        } while (data[headerEnd++] & 0x80 && headerEnd < end);

        if (tag === 0x03) {
            flags = data[headerEnd + 2];
            pos = headerEnd + 3; //ES_ID (2) + flags (1)
            if (flags & 0x80) pos += 2; //dependsOn_ES_ID
            if (flags & 0x40) pos += 1 + data[pos]; //URL
            if (flags & 0x20) pos += 2; //OCR_ES_Id
        } else if (tag === 0x04) {
            pos = headerEnd + 13; //DecoderConfigDescriptor fixed fields
        } else if (tag === 0x05) {
            return {
                objectType: data[headerEnd] >> 3,
                samplingIndex: ((data[headerEnd] & 7) << 1) | (data[headerEnd + 1] >> 7),
                channels: (data[headerEnd + 1] >> 3) & 0x0f
            };
        } else pos = headerEnd + size;
    }

    return null;
}

//returns { tracks: { id: { type, timescale, avc | aac } }, trex: { id: defaults } } or null
function PlayHlsRemux_ParseInit(data) {
    var info = { tracks: {}, trex: {} },
        traks = PlayHlsRemux_Find(data, 0, data.length, ['moov', 'trak']),
        found = false,
        i;

    for (i = 0; i < traks.length; i++) {
        var trak = traks[i];
        var tkhd = PlayHlsRemux_Boxes(data, trak.content, trak.end, 'tkhd')[0];
        var mdhd = PlayHlsRemux_Find(data, trak.content, trak.end, ['mdia', 'mdhd'])[0];
        var hdlr = PlayHlsRemux_Find(data, trak.content, trak.end, ['mdia', 'hdlr'])[0];
        var stsd = PlayHlsRemux_Find(data, trak.content, trak.end, ['mdia', 'minf', 'stbl', 'stsd'])[0];
        if (!tkhd || !mdhd || !hdlr || !stsd) continue;

        var id = PlayHlsRemux_U32(data, tkhd.content + (data[tkhd.content] === 1 ? 20 : 12));
        var timescale = PlayHlsRemux_U32(data, mdhd.content + (data[mdhd.content] === 1 ? 20 : 12));
        var handler = PlayHlsRemux_Type(data, hdlr.content + 8);
        var entry = PlayHlsRemux_Boxes(data, stsd.content + 8, stsd.end)[0];
        if (!entry) continue;

        var entryType = PlayHlsRemux_Type(data, entry.start + 4);

        if (handler === 'vide' && (entryType === 'avc1' || entryType === 'avc3')) {
            //VisualSampleEntry fields are 78 bytes after the box header
            var avcC = PlayHlsRemux_Boxes(data, entry.content + 78, entry.end, 'avcC')[0];
            if (avcC) {
                info.tracks[id] = { type: 'video', timescale: timescale, avc: PlayHlsRemux_ParseAvcC(data, avcC) };
                found = true;
            }
        } else if (handler === 'soun' && entryType === 'mp4a') {
            //AudioSampleEntry fields are 28 bytes after the box header
            var esds = PlayHlsRemux_Boxes(data, entry.content + 28, entry.end, 'esds')[0];
            var aac = esds && PlayHlsRemux_ParseEsds(data, esds);
            if (aac) {
                info.tracks[id] = { type: 'audio', timescale: timescale, aac: aac };
                found = true;
            }
        }
    }

    var trexs = PlayHlsRemux_Find(data, 0, data.length, ['moov', 'mvex', 'trex']);
    for (i = 0; i < trexs.length; i++) {
        var pos = trexs[i].content + 4;
        info.trex[PlayHlsRemux_U32(data, pos)] = {
            duration: PlayHlsRemux_U32(data, pos + 8),
            size: PlayHlsRemux_U32(data, pos + 12),
            flags: PlayHlsRemux_U32(data, pos + 16)
        };
    }

    return found ? info : null;
}

//parses the init segment once, all fragments of a level share the same init data
function PlayHlsRemux_GetInit(initData) {
    if (PlayHlsRemux_InitCache.data !== initData) {
        PlayHlsRemux_InitCache.data = initData;
        PlayHlsRemux_InitCache.info = PlayHlsRemux_ParseInit(initData instanceof Uint8Array ? initData : new Uint8Array(initData));
    }
    return PlayHlsRemux_InitCache.info;
}

//adds all samples of a traf to samples: [{ track, dts, cts, data, key }] with dts/cts in the track timescale
function PlayHlsRemux_ParseTraf(data, moof, traf, info, samples) {
    var tfhd = PlayHlsRemux_Boxes(data, traf.content, traf.end, 'tfhd')[0];
    if (!tfhd) return;

    var pos = tfhd.content,
        flags = (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3],
        trackId = PlayHlsRemux_U32(data, pos + 4),
        track = info.tracks[trackId],
        trex = info.trex[trackId] || { duration: 0, size: 0, flags: 0 },
        base = moof.start,
        defaultDuration = trex.duration,
        defaultSize = trex.size,
        defaultFlags = trex.flags;

    if (!track) return;

    pos += 8;
    if (flags & 0x1) {
        base = PlayHlsRemux_U32(data, pos) * 4294967296 + PlayHlsRemux_U32(data, pos + 4);
        pos += 8;
    }
    if (flags & 0x2) pos += 4;
    if (flags & 0x8) {
        defaultDuration = PlayHlsRemux_U32(data, pos);
        pos += 4;
    }
    if (flags & 0x10) {
        defaultSize = PlayHlsRemux_U32(data, pos);
        pos += 4;
    }
    if (flags & 0x20) defaultFlags = PlayHlsRemux_U32(data, pos);

    var dts = 0;
    var tfdt = PlayHlsRemux_Boxes(data, traf.content, traf.end, 'tfdt')[0];
    if (tfdt) {
        dts =
            data[tfdt.content] === 1
                ? PlayHlsRemux_U32(data, tfdt.content + 4) * 4294967296 + PlayHlsRemux_U32(data, tfdt.content + 8)
                : PlayHlsRemux_U32(data, tfdt.content + 4);
    }

    var truns = PlayHlsRemux_Boxes(data, traf.content, traf.end, 'trun');
    for (var t = 0; t < truns.length; t++) {
        pos = truns[t].content;
        var version = data[pos],
            trunFlags = (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3],
            count = PlayHlsRemux_U32(data, pos + 4),
            offset = base,
            firstFlags = null;

        pos += 8;
        if (trunFlags & 0x1) {
            offset = base + PlayHlsRemux_I32(data, pos);
            pos += 4;
        }
        if (trunFlags & 0x4) {
            firstFlags = PlayHlsRemux_U32(data, pos);
            pos += 4;
        }

        for (var i = 0; i < count; i++) {
            var duration = defaultDuration,
                size = defaultSize,
                sampleFlags = i === 0 && firstFlags !== null ? firstFlags : defaultFlags,
                cts = 0;

            if (trunFlags & 0x100) {
                duration = PlayHlsRemux_U32(data, pos);
                pos += 4;
            }
            if (trunFlags & 0x200) {
                size = PlayHlsRemux_U32(data, pos);
                pos += 4;
            }
            if (trunFlags & 0x400) {
                sampleFlags = PlayHlsRemux_U32(data, pos);
                pos += 4;
            }
            if (trunFlags & 0x800) {
                cts = version === 0 ? PlayHlsRemux_U32(data, pos) : PlayHlsRemux_I32(data, pos);
                pos += 4;
            }

            if (offset + size <= data.length) {
                samples.push({
                    track: track,
                    dts: dts,
                    cts: cts,
                    data: data.subarray(offset, offset + size),
                    //sample_is_non_sync_sample flag
                    key: !(Math.floor(sampleFlags / 65536) & 1)
                });
            }

            offset += size;
            dts += duration;
        }
    }
}

function PlayHlsRemux_Crc32(data, start, end) {
    var crc = 0xffffffff,
        i,
        j,
        c;

    if (!PlayHlsRemux_CrcTable) {
        PlayHlsRemux_CrcTable = [];
        for (i = 0; i < 256; i++) {
            c = i << 24;
            for (j = 0; j < 8; j++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
            PlayHlsRemux_CrcTable[i] = c >>> 0;
        }
    }

    for (i = start; i < end; i++) crc = ((crc << 8) ^ PlayHlsRemux_CrcTable[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;

    return crc;
}

//writes a PSI section (PAT or PMT) without CRC in a single TS packet, the CRC is added here
function PlayHlsRemux_PsiPacket(out, pid, section, counters) {
    var packet = new Uint8Array(PlayHlsRemux_TS_PACKET),
        i;

    for (i = 0; i < packet.length; i++) packet[i] = 0xff;

    packet[0] = 0x47;
    packet[1] = 0x40 | ((pid >> 8) & 0x1f);
    packet[2] = pid & 0xff;
    packet[3] = 0x10 | (counters[pid] & 0x0f);
    counters[pid] = (counters[pid] + 1) & 0x0f;
    packet[4] = 0; //pointer field

    for (i = 0; i < section.length; i++) packet[5 + i] = section[i];

    var crcPos = 5 + section.length;
    var crc = PlayHlsRemux_Crc32(packet, 5, crcPos);
    packet[crcPos] = (crc >>> 24) & 0xff;
    packet[crcPos + 1] = (crc >>> 16) & 0xff;
    packet[crcPos + 2] = (crc >>> 8) & 0xff;
    packet[crcPos + 3] = crc & 0xff;

    out.push(packet);
}

function PlayHlsRemux_WritePsi(out, counters, hasVideo, hasAudio) {
    //PAT: program 1 -> PMT PID
    PlayHlsRemux_PsiPacket(
        out,
        0,
        [0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe0 | (PlayHlsRemux_PID_PMT >> 8), PlayHlsRemux_PID_PMT & 0xff],
        counters
    );

    var streams = [];
    if (hasVideo) streams.push(0x1b, 0xe0 | (PlayHlsRemux_PID_VIDEO >> 8), PlayHlsRemux_PID_VIDEO & 0xff, 0xf0, 0x00);
    if (hasAudio) streams.push(0x0f, 0xe0 | (PlayHlsRemux_PID_AUDIO >> 8), PlayHlsRemux_PID_AUDIO & 0xff, 0xf0, 0x00);

    var pcrPid = hasVideo ? PlayHlsRemux_PID_VIDEO : PlayHlsRemux_PID_AUDIO;
    //section_length counts the bytes after it: 9 fixed + streams + 4 CRC
    var sectionLength = 9 + streams.length + 4;
    var pmt = [0x02, 0xb0 | (sectionLength >> 8), sectionLength & 0xff, 0x00, 0x01, 0xc1, 0x00, 0x00, 0xe0 | (pcrPid >> 8), pcrPid & 0xff, 0xf0, 0x00].concat(
        streams
    );

    PlayHlsRemux_PsiPacket(out, PlayHlsRemux_PID_PMT, pmt, counters);
}

//writes a 33 bits timestamp in the 5 bytes PES format
function PlayHlsRemux_WriteTimestamp(header, pos, prefix, ts) {
    var high = Math.floor(ts / 1073741824) & 0x7, // bits 32..30
        low = ts % 1073741824; // bits 29..0

    header[pos] = (prefix << 4) | (high << 1) | 1;
    header[pos + 1] = (low >>> 22) & 0xff;
    header[pos + 2] = (((low >>> 15) & 0x7f) << 1) | 1;
    header[pos + 3] = (low >>> 7) & 0xff;
    header[pos + 4] = ((low & 0x7f) << 1) | 1;
}

//splits a PES packet (header + payload parts) in TS packets
function PlayHlsRemux_WritePes(out, counters, pid, streamId, pts, dts, parts) {
    var payloadLength = 0,
        i;

    for (i = 0; i < parts.length; i++) payloadLength += parts[i].length;

    var hasDts = dts !== null && dts !== pts;
    var headerDataLength = hasDts ? 10 : 5;
    var header = new Uint8Array(9 + headerDataLength);
    var pesLength = 3 + headerDataLength + payloadLength;

    header[2] = 1;
    header[3] = streamId;
    //video PES length can be 0 (unbounded), audio must fit 16 bits
    if (pesLength > 0xffff) pesLength = 0;
    header[4] = (pesLength >> 8) & 0xff;
    header[5] = pesLength & 0xff;
    header[6] = 0x80;
    header[7] = hasDts ? 0xc0 : 0x80;
    header[8] = headerDataLength;
    PlayHlsRemux_WriteTimestamp(header, 9, hasDts ? 3 : 2, pts);
    if (hasDts) PlayHlsRemux_WriteTimestamp(header, 14, 1, dts);

    var chunks = [header].concat(parts),
        chunkIndex = 0,
        chunkPos = 0,
        remaining = header.length + payloadLength,
        first = true;

    while (remaining > 0) {
        var packet = new Uint8Array(PlayHlsRemux_TS_PACKET);
        var space = PlayHlsRemux_TS_PACKET - 4;
        var payload = Math.min(space, remaining);
        var stuffing = space - payload;
        var pos = 4;

        packet[0] = 0x47;
        packet[1] = (first ? 0x40 : 0) | ((pid >> 8) & 0x1f);
        packet[2] = pid & 0xff;
        packet[3] = (stuffing > 0 ? 0x30 : 0x10) | (counters[pid] & 0x0f);
        counters[pid] = (counters[pid] + 1) & 0x0f;

        if (stuffing > 0) {
            //adaptation field used only for stuffing
            packet[4] = stuffing - 1;
            if (stuffing > 1) {
                packet[5] = 0;
                for (i = 6; i < 4 + stuffing; i++) packet[i] = 0xff;
            }
            pos = 4 + stuffing;
        }

        var toCopy = payload;
        while (toCopy > 0) {
            var chunk = chunks[chunkIndex];
            var copy = Math.min(toCopy, chunk.length - chunkPos);
            packet.set(chunk.subarray(chunkPos, chunkPos + copy), pos);
            pos += copy;
            chunkPos += copy;
            toCopy -= copy;
            if (chunkPos >= chunk.length) {
                chunkIndex++;
                chunkPos = 0;
            }
        }

        remaining -= payload;
        first = false;
        out.push(packet);
    }
}

function PlayHlsRemux_To90k(value, timescale) {
    return Math.round((value * 90000) / timescale) % PlayHlsRemux_PTS_WRAP;
}

//length prefixed NAL units -> Annex B with an access unit delimiter, SPS/PPS before key frames
function PlayHlsRemux_VideoParts(sample) {
    var avc = sample.track.avc,
        data = sample.data,
        parts = [PlayHlsRemux_Aud],
        pos = 0,
        i,
        length;

    if (sample.key) {
        for (i = 0; i < avc.sps.length; i++) parts.push(PlayHlsRemux_StartCode, avc.sps[i]);
        for (i = 0; i < avc.pps.length; i++) parts.push(PlayHlsRemux_StartCode, avc.pps[i]);
    }

    while (pos + avc.nalLengthSize <= data.length) {
        length = 0;
        for (i = 0; i < avc.nalLengthSize; i++) length = length * 256 + data[pos + i];
        pos += avc.nalLengthSize;
        if (length <= 0 || pos + length > data.length) break;

        //skip the stream own access unit delimiter, one is already added
        if ((data[pos] & 0x1f) !== 9) parts.push(PlayHlsRemux_StartCode, data.subarray(pos, pos + length));
        pos += length;
    }

    return parts;
}

function PlayHlsRemux_Adts(aac, frameLength) {
    var length = frameLength + 7;
    return new Uint8Array([
        0xff,
        0xf1,
        ((aac.objectType - 1) << 6) | (aac.samplingIndex << 2) | (aac.channels >> 2),
        ((aac.channels & 3) << 6) | (length >> 11),
        (length >> 3) & 0xff,
        ((length & 7) << 5) | 0x1f,
        0xfc
    ]);
}

//converts a fMP4 fragment to MPEG-TS, returns a Uint8Array or null if the fragment has no supported samples
function PlayHlsRemux_FragmentToTs(data, info) {
    var samples = [],
        moofs = PlayHlsRemux_Boxes(data, 0, data.length, 'moof'),
        hasVideo = false,
        hasAudio = false,
        i,
        j;

    for (i = 0; i < moofs.length; i++) {
        var trafs = PlayHlsRemux_Boxes(data, moofs[i].content, moofs[i].end, 'traf');
        for (j = 0; j < trafs.length; j++) PlayHlsRemux_ParseTraf(data, moofs[i], trafs[j], info, samples);
    }

    if (!samples.length) return null;

    for (i = 0; i < samples.length; i++) {
        if (samples[i].track.type === 'video') hasVideo = true;
        else hasAudio = true;
    }

    var out = [],
        counters = {};

    counters[0] = 0;
    counters[PlayHlsRemux_PID_PMT] = 0;
    counters[PlayHlsRemux_PID_VIDEO] = 0;
    counters[PlayHlsRemux_PID_AUDIO] = 0;

    PlayHlsRemux_WritePsi(out, counters, hasVideo, hasAudio);

    var audioParts = [],
        audioPts = null,
        audioLength = 0;

    var flushAudio = function () {
        if (audioParts.length) PlayHlsRemux_WritePes(out, counters, PlayHlsRemux_PID_AUDIO, 0xc0, audioPts, null, audioParts);
        audioParts = [];
        audioPts = null;
        audioLength = 0;
    };

    for (i = 0; i < samples.length; i++) {
        var sample = samples[i],
            track = sample.track;

        if (track.type === 'video') {
            flushAudio();
            PlayHlsRemux_WritePes(
                out,
                counters,
                PlayHlsRemux_PID_VIDEO,
                0xe0,
                PlayHlsRemux_To90k(sample.dts + sample.cts, track.timescale),
                PlayHlsRemux_To90k(sample.dts, track.timescale),
                PlayHlsRemux_VideoParts(sample)
            );
        } else {
            //group the AAC frames of a chunk in one PES, keep it under the 16 bits PES length
            if (audioLength + sample.data.length + 7 > 60000) flushAudio();
            if (audioPts === null) audioPts = PlayHlsRemux_To90k(sample.dts, track.timescale);
            audioParts.push(PlayHlsRemux_Adts(track.aac, sample.data.length), sample.data);
            audioLength += sample.data.length + 7;
        }
    }
    flushAudio();

    var result = new Uint8Array(out.length * PlayHlsRemux_TS_PACKET);
    for (i = 0; i < out.length; i++) result.set(out[i], i * PlayHlsRemux_TS_PACKET);

    return result;
}

//node.js export for tests, the app uses the global functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ParseInit: PlayHlsRemux_ParseInit,
        FragmentToTs: PlayHlsRemux_FragmentToTs
    };
}
