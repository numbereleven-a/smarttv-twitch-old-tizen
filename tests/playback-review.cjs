#!/usr/bin/env node
'use strict';
// Offline review checks. No dependencies, network requests, or source edits.
// Usage: node review_checks.cjs /path/to/extracted/project [results.json]
// FAIL means the unmodified code does not satisfy the stated behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || '.');
if (!fs.existsSync(path.join(root, 'app/specific/Play.js'))) {
  console.error('Pass the extracted project directory as the first argument.');
  process.exit(2);
}
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const realHls = require(path.join(root, 'app/thirdparty/hls.js'));
const results = [];
function check(name, fn) {
  try { const evidence = fn(); results.push({name, status: 'PASS', evidence}); }
  catch (error) { results.push({name, status: 'FAIL', error: error.message}); }
}
function env() {
  const stats = {nativePause:0,nativePlay:0,videoPause:0,videoPlay:0,
    destroy:0,stopLoad:0,recover:0,warning:0,prepare:0,drop:0,fallback:0,
    terminal:0,requests:[],logs:[],pendingPrepare:[],timers:[]};
  const noop = function () {};
  function element(tag) {
    const listeners = {};
    return {tagName:tag,style:{},classList:{add:noop,remove:noop},listeners,
      currentTime:0,paused:true,readyState:4,duration:600,buffered:{length:0},
      videoWidth:1280,videoHeight:720,
      appendChild:noop,remove:noop,removeAttribute:noop,load:noop,setAttribute:noop,
      getBoundingClientRect:()=>({left:0,top:0,width:1920,height:1080}),
      addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
      removeEventListener:noop,
      pause() { stats.videoPause++;this.paused=true; },
      play() { stats.videoPlay++;this.paused=false; },
      dispatch(name) { for (const fn of listeners[name] || []) fn();
        if (typeof this['on'+name] === 'function') this['on'+name](); }
    };
  }
  const elements = {};
  const document = {createElement:element,body:element('body'),
    getElementById:id => (elements[id] ||= element('div')),
    addEventListener:noop,removeEventListener:noop};
  class FakeHls {
    constructor() { this.handlers={}; }
    on(name,fn) { (this.handlers[name] ||= []).push(fn); }
    trigger(name,data) { for (const fn of this.handlers[name] || []) fn(name,data); }
    attachMedia(video) { this.media=video; }
    loadSource(url) { this.url=url; }
    destroy() { stats.destroy++; }
    stopLoad() { stats.stopLoad++; }
    recoverMediaError() { stats.recover++; }
  }
  FakeHls.Events=realHls.Events;
  FakeHls.ErrorTypes=realHls.ErrorTypes;
  FakeHls.version=realHls.version;
  FakeHls.isSupported=()=>true;
  FakeHls.isMSESupported=()=>true;
  function XHR() { this.headers={};stats.requests.push(this); }
  XHR.prototype.open=function(method,url) { this.method=method;this.url=url; };
  XHR.prototype.setRequestHeader=function(key,value) {this.headers[key]=value;};
  XHR.prototype.send=function(body) {this.body=body;};
  XHR.prototype.abort=function() {this.aborted=true;};
  XHR.prototype.respond=function(body,status=200) {
    this.readyState=4;this.status=status;this.responseText=body;this.onreadystatechange();
  };
  const c = {document,Hls:FakeHls,Uint8Array,ArrayBuffer,Date,Math,
    console:Object.fromEntries(['log','error','trace','warn'].map(k=>[k,(...args)=>stats.logs.push(args)])),
    XMLHttpRequest:XHR,Main_IsNotBrowser:true,Main_isReleased:false,
    Main_values:{Play_selectedChannel:'channel_a',vodOffset:0},navigator:{onLine:true},
    addEventListener:noop,setTimeout:(fn)=>{stats.timers.push(fn);return stats.timers.length;},clearTimeout:noop,setInterval:()=>1,clearInterval:noop,
    getComputedStyle:x=>x.style,PlaybackDiagnostics:noop,
    Main_RandomInt:()=>42,Settings_Obj_default:()=>0,
    Main_startsWith:(a,b)=>a.indexOf(b)===0,Main_A_includes_B:(a,b)=>a.includes(b),
    localStorage:{getItem:()=>null,setItem:noop},
    STR_SOURCE:'source',STR_SPACE:' ',STR_WATCHING:'watching',
    webapis:{appcommon:{setScreenSaver:noop,AppCommonScreenSaverState:{SCREEN_SAVER_OFF:0,SCREEN_SAVER_ON:1}}},
    PlayClip_isOn:false,PlayClip_streamCheckId:null,PlayClip_PlayerCheck:noop,
    ChatLive_MessagesRunAfterPause:noop,Chat_Init:noop,
    Main_innerHTML:noop,Main_textContent:noop,Main_setItem:noop
  };
  c.window=c;vm.createContext(c);
  for (const file of ['app/general/Fmp4TrackIsolation.js','app/general/LegacyFmp4Buffers.js',
                      'app/specific/Play.js','app/specific/PlayVod.js']) {
    vm.runInContext(read(file),c,{filename:file});
  }
  // Only platform/UI boundaries are replaced; each checked function is unmodified.
  for (const name of ['Play_ShowBlackOverlay','Play_HideBlackOverlay','Play_showBufferDialog',
    'Play_HideBufferDialog','Play_SetFullScreen','Play_SetAvplayVisible','Play_SetHlsVisible',
    'Play_loadChat','Play_hidePanel','Play_clearPause','PlayVod_hidePanel','PlayClip_hidePanel']) c[name]=noop;
  c.Play_BufferDialogVisible=()=>false;c.Play_isPanelShown=()=>false;
  c.Play_WarningDialogVisible=()=>false;
  c.Play_isEndDialogVisible=()=>false;
  c.Play_showWarningDialog=()=>stats.warning++;
  c.Play_CheckEndStart=()=>stats.terminal++;
  c.Play_PannelEndStart=()=>stats.terminal++;
  c.Play_avplay={stop:noop,close:noop,open:noop,setBufferingParam:noop,setListener:noop,
    getState:()=> 'PLAYING',getCurrentTime:()=>120000,
    pause(){stats.nativePause++;},play(){stats.nativePlay++;},
    prepareAsync(ok,fail){stats.prepare++;stats.pendingPrepare.push(fail);}};
  c.Play_avplay_hls_player=element('video');
  return {c,stats,element};
}
const rendition = (name,w,h,codec='avc1.4d401f,mp4a.40.2') =>
  '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="'+name+'",NAME="'+name+'",AUTOSELECT=YES,DEFAULT=NO\n'+
  '#EXT-X-STREAM-INF:BANDWIDTH=3000000,CODECS="'+codec+'",RESOLUTION='+w+'x'+h+',VIDEO="'+name+'"\n'+
  'https://example.invalid/'+name+'/index.m3u8\n';

check('Control: all bundled JavaScript parses in Node (not a Tizen compatibility test)',()=>{
  const files=[];
  function walk(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.js'))files.push(f);
  }}
  walk(path.join(root,'app'));
  for(const f of files)new vm.Script(fs.readFileSync(f,'utf8'),{filename:path.relative(root,f)});
  return {files:files.length,hlsVersion:realHls.version};
});
check('Control: LF AVC master is parsed and filtered to FHD',()=>{
  const {c}=env();const q=c.Play_extractQualities('#EXTM3U\n'+rendition('1440p',2560,1440)+rendition('720p',1280,720)+rendition('1080p',1920,1080));
  assert.equal(q.length,2);assert.equal(q[0].resolution,'1920x1080');
  return q.map(x=>x.id);
});
check('R1: native prepare failures must stop retrying or fall back',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=false;
  c.Play_DropOneQuality=()=>stats.drop++;c.Play_UseHlsFallbackLive=()=>stats.fallback++;
  c.Play_PlayNativeLive('https://example.invalid/live.m3u8');
  for(let i=0;i<4&&stats.pendingPrepare.length;i++) {
    stats.pendingPrepare.shift()();
    const timers=stats.timers.splice(0);timers.forEach(fn=>fn());
  }
  assert.ok(stats.drop+stats.fallback+stats.terminal>0,
    `No recovery branch reached after 4 failures: prepare=${stats.prepare}, counter=${c.Play_onPlayerCounter}`);
});
check('R2: native PLAYING must be recognized by the stall watchdog',()=>{
  const {c}=env();assert.equal(c.Play_isIdleOrPlaying(),true,'getState=PLAYING, but Play_isIdleOrPlaying() is false');
});
check('R3a: pause native live must call AVPlay.pause',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=false;c.Play_KeyPause(1);
  assert.equal(stats.nativePause,1,`nativePause=${stats.nativePause}, hiddenVideoPause=${stats.videoPause}`);
});
check('R3b: native VOD PLAYING must not be reported as paused',()=>{
  const {c}=env();c.PlayVod_isOn=true;c.PlayVod_useHls=false;
  assert.equal(c.Play_isNotplaying(),false,'Native VOD is PLAYING, but Play_isNotplaying() is true');
});
check('R4: changing VOD HLS quality must bind handlers to the replacement video',()=>{
  const {c}=env();c.PlayVod_isOn=true;c.PlayVod_useHls=true;c.PlayVod_playingUrl='https://example.invalid/vod.m3u8';
  c.PlayVod_onPlayer();const first=c.Play_avplay_hls_player;
  assert.equal(typeof first.ontimeupdate,'function');
  c.PlayVod_onPlayer();const second=c.Play_avplay_hls_player;
  assert.notEqual(first,second);
  assert.equal(typeof second.ontimeupdate,'function',`Video replaced; global bound flag=${c.PlayVod_hlsListenerBound}; new ontimeupdate=${typeof second.ontimeupdate}`);
});
check('R5: stopping playback must release or stop the HLS loader',()=>{
  const {c,stats}=env();c.initHLSPlayer();c.Play_offPlayer();
  assert.ok(stats.destroy+stats.stopLoad>0,
    `HLS instance retained=${!!c.hls}; destroy=${stats.destroy}; stopLoad=${stats.stopLoad}; videoPause=${stats.videoPause}`);
});
check('R6: fatal live HLS media error must recover or enter a terminal UI state',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  c.hls.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.MEDIA_ERROR,details:'bufferAppendError'});
  assert.ok(stats.recover+stats.destroy+stats.warning+stats.terminal>0,
    'Fatal error only logged: no recovery, destroy, warning, or terminal state');
});
check('R7a: one audio-only rendition must not discard a valid AVC rendition',()=>{
  const {c}=env();const text='#EXTM3U\n'+rendition('720p',1280,720)+
    '#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="audio_only",NAME="audio_only"\n'+
    '#EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS="mp4a.40.2",VIDEO="audio_only"\n'+
    'https://example.invalid/audio.m3u8\n';
  const q=c.Play_extractQualities(text);assert.equal(q.length,1);
});
check('R7b: CRLF master playlists must parse like LF',()=>{
  const {c}=env();const text=('#EXTM3U\n'+rendition('720p',1280,720)).replace(/\n/g,'\r\n');
  assert.equal(c.Play_extractQualities(text).length,1,'CRLF playlist yields zero renditions');
});
check('R8: a previous channel token response must be ignored after channel switch',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_isLive=true;c.use_proxy=false;
  c.Play_Headers=[];c.Play_live_token='{"channel":"%x"}';
  c.Play_state=c.Play_STATE_LOADING_TOKEN;c.Play_loadDataRequest();
  const oldRequest=stats.requests[0];
  c.Main_values.Play_selectedChannel='channel_b';
  c.Play_state=c.Play_STATE_LOADING_TOKEN;c.Play_tokenResponse=0;c.Play_loadDataRequest();
  oldRequest.respond(JSON.stringify({data:{streamPlaybackAccessToken:{value:'TEST_TOKEN_A',signature:'TEST_SIG_A'}}}));
  const last=stats.requests[stats.requests.length-1];
  assert.equal(stats.requests.length,2,
    `Stale callback started a request for channel_b with channel_a token: ${last.url.includes('channel_b.m3u8')&&last.url.includes('TEST_TOKEN_A')}`);
});
check('R9: stored explicit 720p choice must survive a different source label',()=>{
  const {c}=env();c.Play_qualities=c.Play_extractQualities('#EXTM3U\n'+rendition('1080p',1920,1080)+rendition('720p',1280,720));
  c.Play_quality='720p | source';c.Play_isOn=false;c.Play_qualityChanged();
  assert.equal(c.Play_qualities[c.Play_qualityIndex].resolution,'1280x720',`Stored 720p | source selects ${c.Play_quality}`);
});
check('R10: empty compatible VOD quality list must not throw',()=>{
  const {c}=env();c.PlayVod_qualities=[];
  assert.doesNotThrow(()=>c.PlayVod_qualityChanged());
});
check('R11: live HLS timeupdate must advance the application playback time',()=>{
  const {c}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  const video=c.Play_avplay_hls_player;video.paused=false;video.currentTime=60;video.dispatch('timeupdate');
  assert.ok(c.Play_currentTime>0,`video.currentTime=60 seconds, Play_currentTime=${c.Play_currentTime}`);
});
check('Control: fMP4 parser rejects a truncated box',()=>{
  const iso=require(path.join(root,'app/general/Fmp4TrackIsolation.js'));
  assert.throws(()=>iso.tracks(new Uint8Array([0,0,0,10,109,111,111,118])),/Invalid box size/);
  return 'Malformed input rejected';
});
check('Fatal manifest failure must enter terminal UI without an unusable restart',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  c.hls.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.NETWORK_ERROR,details:'manifestLoadError'});
  assert.equal(c.hls,null);assert.ok(stats.warning>0 && stats.terminal>0);
});
check('VOD replay consumes the replay flag and later quality changes preserve position',()=>{
  const {c}=env();c.PlayVod_isOn=true;c.PlayVod_useHls=true;c.PlayVod_replay=true;
  c.PlayVod_playingUrl='https://example.invalid/vod.m3u8';c.PlayVod_onPlayer();
  assert.equal(c.PlayVod_replay,false);
  c.Play_avplay_hls_player.currentTime=75;c.PlayVod_onPlayer();
  c.PlayVod_ProgresBarrUpdate=()=>{};c.PlayClip_HasVOD=false;
  c.Play_avplay_hls_player.onloadedmetadata();
  assert.equal(c.Play_avplay_hls_player.currentTime,75);
});
check('Media recovery is bounded and stopped controllers cannot affect playback',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  const old=c.hls;
  for(let i=0;i<3;i++)old.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.MEDIA_ERROR});
  assert.equal(stats.recover,2);assert.equal(c.hls,null);assert.ok(stats.terminal>0);
  const terminal=stats.terminal;
  old.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.MEDIA_ERROR});
  assert.equal(stats.terminal,terminal);
});
check('Requests from a closed and reopened same channel are rejected',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_isLive=true;c.use_proxy=false;
  c.Play_Headers=[];c.Play_live_token='{"channel":"%x"}';c.Play_state=c.Play_STATE_LOADING_TOKEN;
  c.Play_loadDataRequest();const old=stats.requests[0];c.Play_InvalidateSession();c.Play_loadDataRequest();
  old.respond({});assert.equal(stats.requests.length,2);assert.ok(old.aborted);
});
check('A master without EXT-X-MEDIA or BANDWIDTH still keeps a valid rendition',()=>{
  const {c}=env();const q=c.Play_extractQualities('#EXTM3U\r\n#EXT-X-STREAM-INF:CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=60\r\nhttps://example.invalid/720.m3u8');
  assert.equal(q.length,1);assert.equal(q[0].id,'720p60 | source');
});
const failed=results.filter(r=>r.status==='FAIL').length;
const report={kind:'offline mocked unit checks',project:path.basename(root),
  hlsVersion:realHls.version,total:results.length,passed:results.length-failed,failed,results};
for(const r of results)console.log(`${r.status}: ${r.name}\n  ${r.error||JSON.stringify(r.evidence)}`);
console.log(`\n${report.total} checks: ${report.passed} PASS, ${report.failed} FAIL.`);
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
process.exitCode=failed?1:0;
