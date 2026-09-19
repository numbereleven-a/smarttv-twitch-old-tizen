#!/usr/bin/env node
'use strict';
// Usage: node fmp4_smoke.cjs /path/to/project [output-directory]
// Requires Node.js and FFmpeg with libx264/AAC. Uses synthetic local input only.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'.');
const out=path.resolve(process.argv[3]||'fmp4-smoke-output');
function ffmpeg(args) {
  const result=cp.spawnSync('ffmpeg',['-v','error',...args],{encoding:'utf8',timeout:30000});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(result.stderr||'FFmpeg failed');
}
try {
  const iso=require(path.join(root,'app/general/Fmp4TrackIsolation.js'));
  fs.mkdirSync(out,{recursive:true});
  const combined=path.join(out,'combined.mp4');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=128x72:rate=10',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000',
    '-t','2','-c:v','libx264','-preset','ultrafast','-g','10','-c:a','aac',
    '-movflags','+frag_keyframe+empty_moov+default_base_moof','-y',combined]);
  const input=new Uint8Array(fs.readFileSync(combined));
  const tracks=iso.tracks(input);
  assert.equal(tracks.length,2);
  const results=[];
  for(const track of tracks) {
    const isolated=path.join(out,track.type+'.mp4');
    const bytes=iso.isolate(input,track.id);
    assert.deepEqual(iso.tracks(bytes),[track]);
    fs.writeFileSync(isolated,bytes);
    const stream=track.type==='video'?'v':'a';
    const before=path.join(out,'combined-'+track.type+'.md5');
    const after=path.join(out,'isolated-'+track.type+'.md5');
    ffmpeg(['-i',combined,'-map','0:'+stream+':0','-f','framemd5','-y',before]);
    ffmpeg(['-i',isolated,'-map','0:'+stream+':0','-f','framemd5','-y',after]);
    const frames=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>x.trim());
    const a=frames(before),b=frames(after);
    assert.deepEqual(b,a);
    results.push({track:track.type,original_frames:a.length,isolated_frames:b.length,
      decoded_frames_timestamps_and_hashes_identical:true});
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
} catch(error) {
  console.error(error.stack||error.message);process.exitCode=1;
}
