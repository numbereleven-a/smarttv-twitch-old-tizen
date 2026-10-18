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
    terminal:0,requests:[],logs:[],pendingPrepare:[],pendingReady:[],timers:[],timerDelays:[],intervals:new Map()};
  let intervalId=0;
  const noop = function () {};
  function element(tag) {
    const listeners = {};
    const classes=new Set();
    return {tagName:tag,style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},listeners,
      currentTime:0,paused:true,readyState:4,duration:600,buffered:{length:0},
      videoWidth:1280,videoHeight:720,
      appendChild:child=>{if(child.id)elements[child.id]=child;},remove:noop,removeAttribute:noop,load:noop,setAttribute:noop,
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
    startLoad(position) { this.startPosition=position; }
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
    addEventListener:noop,setTimeout:(fn,delay)=>{stats.timers.push(fn);stats.timerDelays.push(delay);return stats.timers.length;},clearTimeout:noop,
    setInterval:fn=>{stats.intervals.set(++intervalId,fn);return intervalId;},clearInterval:id=>stats.intervals.delete(id),
    getComputedStyle:x=>x.style,PlaybackDiagnostics:noop,
    Main_RandomInt:()=>42,Settings_Obj_default:()=>0,
    Main_startsWith:(a,b)=>a.indexOf(b)===0,Main_A_includes_B:(a,b)=>a.includes(b),
    localStorage:{getItem:()=>null,setItem:noop},
    STR_SOURCE:'source',STR_SPACE:' ',STR_BR:'<br>',STR_WATCHING:'watching',STR_REPLAY:'Replay',STR_RELOAD:'Reload',
    KEY_UP:38,KEY_DOWN:40,
    webapis:{appcommon:{setScreenSaver:noop,AppCommonScreenSaverState:{SCREEN_SAVER_OFF:0,SCREEN_SAVER_ON:1}}},
    PlayClip_isOn:false,PlayClip_streamCheckId:null,PlayClip_PlayerCheck:noop,
    ChatLive_MessagesRunAfterPause:noop,Chat_Init:noop,
    Main_innerHTML:(id,text)=>document.getElementById(id).innerHTML=text,
    Main_textContent:(id,text)=>document.getElementById(id).textContent=text,Main_setItem:noop,
    Main_AddClass:(id,name)=>document.getElementById(id).classList.add(name),
    Main_RemoveClass:(id,name)=>document.getElementById(id).classList.remove(name),
    Main_ShowElement:id=>document.getElementById(id).classList.remove('hide'),
    Main_HideElement:id=>document.getElementById(id).classList.add('hide')
  };
  c.window=c;vm.createContext(c);
  c.PlaybackDiagnostics.error=noop;
  for (const file of ['app/languages/0_Strings.js','app/general/Fmp4TrackIsolation.js','app/general/LegacyFmp4Buffers.js',
                      'app/general/PlayHlsRemux.js','app/general/Fmp4ToTsLoader.js',
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
  c.Play_PlayEndStart=()=>stats.terminal++;
  c.Play_avplay={stop:noop,close:noop,open:noop,setBufferingParam:noop,setListener:noop,
    getState:()=> 'PLAYING',getCurrentTime:()=>120000,
    pause(){stats.nativePause++;},play(){stats.nativePlay++;},
    prepareAsync(ok,fail){stats.prepare++;stats.pendingPrepare.push(fail);stats.pendingReady.push(ok);}};
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
  c.Play_StartupRetryUsed=true;
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
  c.Play_StartupRetryUsed=true;
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
  c.Play_HasStarted=true;
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
check('Reload gets a fresh token for the same channel and retains the playing quality',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_isLive=true;c.Play_LiveUseHls=true;
  c.Play_qualityPlaying='1080p60';c.Play_quality='720p';
  c.Main_values.Play_selectedChannel_id='123';c.use_proxy=false;c.Play_Headers=[];
  c.Play_live_token='{"channel":"%x"}';c.Play_state=c.Play_STATE_LOADING_TOKEN;
  c.Play_selectedChannel_id_Old='previous_channel';
  c.Play_loadDataRequest();const oldRequest=stats.requests[0];
  c.initHLSPlayer();const oldPlayer=c.hls;const oldVideo=c.Play_avplay_hls_player;
  c.Play_RetryLater(()=>{throw new Error('A stale retry ran');},100);
  const staleRetry=stats.timers[stats.timers.length-1];
  // Metadata, chat and UI boundaries; Play_Start and the token request remain real.
  for(const name of ['Play_ResetProxy','Main_empty','Main_SaveValues','UserLiveFeed_Hide',
    'UserLiveFeed_SetFeedPicText','ChatLive_Clear','Play_updateStreamInfoStart','Play_updateStreamInfo',
    'PlayClip_UpdateGameInfo','Play_IconsResetFocus','PlayClip_HideShowNext','Main_handleKeyUp'])c[name]=()=>{};
  c.IMG_404_LOGO_TEMP='';c.PlayClip_qualities=[];
  c.Play_StartupRetryUsed=true;c.Play_ReloadLive(true);
  assert.equal(c.Play_StartupRetryUsed,true);
  assert.ok(oldRequest.aborted);assert.equal(stats.destroy,1);assert.ok(oldVideo.playbackDisposed);
  assert.equal(c.Main_values.Play_selectedChannel,'channel_a');assert.equal(c.Main_values.Play_selectedChannel_id,'123');
  assert.equal(c.Play_quality,'1080p60');assert.equal(c.Play_qualityPlaying,'1080p60');
  assert.equal(c.Play_tokenResponse,0);assert.equal(c.Play_playlistResponse,0);
  assert.equal(c.Play_selectedChannel_id_Old,null);staleRetry();
  assert.equal(stats.requests.length,2);assert.equal(stats.requests[1].method,'POST');
  const count=stats.requests.length;
  oldRequest.respond(JSON.stringify({data:{streamPlaybackAccessToken:{value:'TEST_OLD',signature:'TEST_OLD'}}}));
  assert.equal(stats.requests.length,count);
  oldPlayer.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.MEDIA_ERROR});
  assert.equal(stats.terminal,0);
  c.Play_PlayHLSUrl('https://example.invalid/fresh.m3u8');
  assert.notEqual(c.hls,oldPlayer);assert.equal(c.hls.url,'https://example.invalid/fresh.m3u8');
  c.Play_Playing=true;oldVideo.dispatch('pause');assert.equal(c.Play_Playing,true);
  c.Play_ReloadLive();assert.equal(c.Play_StartupRetryUsed,false);
});
check('Live controls focus Reload with Right and activate it with OK; Left returns to Play',()=>{
  const {c}=env();c.Play_isOn=true;c.PlayVod_PanelY=1;c.PlayClip_EnterPos=0;
  c.KEY_LEFT=37;c.KEY_RIGHT=39;c.KEY_ENTER=13;c.UserLiveFeed_isFeedShow=()=>false;
  c.Play_isPanelShown=()=>true;
  let reload=0,pause=0;c.Play_ReloadLive=()=>reload++;c.Play_KeyPause=()=>pause++;
  c.Play_handleKeyDown({keyCode:39});
  assert.ok(c.document.getElementById('reload_button').classList.contains('progress_bar_div_focus'));
  c.Play_handleKeyDown({keyCode:13});assert.equal(reload,1);assert.equal(pause,0);
  c.Play_handleKeyDown({keyCode:37});c.Play_handleKeyDown({keyCode:13});
  assert.equal(pause,1);assert.equal(reload,1);
  c.PlayVod_isOn=true;c.Play_ReloadFocused=true;c.PlayVod_IconsBottonFocus();
  assert.ok(!c.document.getElementById('reload_button').classList.contains('progress_bar_div_focus'));
  assert.ok(c.document.getElementById('pause_button').classList.contains('progress_bar_div_focus'));
});
check('The live error dialog offers Reload and skips the hidden VOD action',()=>{
  const {c}=env();c.Play_isOn=true;c.Play_EndSet(1);
  assert.equal(c.Play_Endcounter,0);assert.equal(c.document.getElementById('dialog_end_replay_text').textContent,'Reload');
  c.KEY_LEFT=37;c.KEY_RIGHT=39;c.KEY_ENTER=13;c.UserLiveFeed_isFeedShow=()=>false;
  c.Play_isEndDialogVisible=()=>true;c.Play_EndFocus=true;c.UserLiveFeed_Hide=()=>{};
  c.STR_IS_OFFLINE='';c.STR_BR='';c.STR_STREAM_END_EXIT='';
  c.Play_handleKeyDown({keyCode:39});assert.equal(c.Play_Endcounter,2);
  c.Play_handleKeyDown({keyCode:37});assert.equal(c.Play_Endcounter,0);
  let reload=0;c.Play_ReloadLive=()=>reload++;
  c.Play_handleKeyDown({keyCode:13});assert.equal(reload,1);
});
check('Live delay is approximate and hidden for Native, VOD, missing metadata and stopped video',()=>{
  const {c}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;
  c.hls={latency:8.4,latestLevelDetails:{live:true}};
  c.Play_UpdateLiveDelay();assert.equal(c.document.getElementById('stream_live_delay').textContent,'LIVE · ~8 s');
  c.Play_LiveUseHls=false;c.Play_UpdateLiveDelay();assert.equal(c.document.getElementById('stream_live_delay').textContent,'');
  c.Play_LiveUseHls=true;c.PlayVod_isOn=true;assert.equal(c.Play_GetLiveDelay(),null);
  c.PlayVod_isOn=false;c.hls.latestLevelDetails=null;assert.equal(c.Play_GetLiveDelay(),null);
  c.hls.latestLevelDetails={live:true};c.Play_avplay_hls_player.playbackDisposed=true;assert.equal(c.Play_GetLiveDelay(),null);
});
check('Debug is off by default, updates when enabled, redacts URLs/tokens and stops on disable',()=>{
  const {c,stats}=env();vm.runInContext(read('app/general/PlaybackDiagnostics.js'),c);
  c.PlaybackDiagnostics('disabled error');assert.equal(stats.logs.length,0);assert.equal(stats.intervals.size,0);
  c.Play_isOn=true;c.Play_LiveUseHls=true;c.Play_avplay_hls_player.currentTime=5;
  c.PlaybackDiagnostics.setEnabled(true);assert.equal(stats.intervals.size,1);
  c.PlaybackDiagnostics('failure https://example.invalid/test?token=TEST_SECRET token=TEST_SECRET');
  const overlay=c.document.getElementById('playback_debug');
  assert.ok(overlay.textContent.includes('[URL]'));assert.ok(!overlay.textContent.includes('TEST_SECRET'));
  assert.ok(overlay.textContent.includes('time=5.0'));
  c.Play_avplay_hls_player.currentTime=12;for(const tick of stats.intervals.values())tick();
  assert.ok(overlay.textContent.includes('time=12.0'));
  c.PlaybackDiagnostics.setEnabled(false);assert.equal(overlay.style.display,'none');assert.equal(stats.intervals.size,0);
});
check('Auto selects HLS for fMP4 before preparing Native and selects Native for TS',()=>{
  for(const fmp4 of [true,false]) {
    const {c,stats}=env();c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_AUTO;
    c.Play_playingUrl='https://example.invalid/live.m3u8';
    c.Play_onPlayer();assert.equal(stats.prepare,0);assert.equal(stats.requests.length,1);
    stats.requests[0].respond('#EXTM3U\r\n'+(fmp4?'#EXT-X-MAP:URI="init.mp4"\r\n':'')+'#EXTINF:2,\r\nsegment.'+(fmp4?'mp4':'ts'));
    assert.equal(c.Play_LiveUseHls,fmp4);assert.equal(stats.prepare,fmp4?0:1);
    assert.equal(c.document.getElementById('stream_player_mode').textContent,fmp4?'Auto · HLS':'Auto · Native');
    if(fmp4) {assert.ok(stats.videoPlay>0);assert.equal(c.hls.url,c.Play_playingUrl);}
  }
});
check('Auto recovers from an IDLE Native prepare timeout and ignores a late success callback',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_AUTO;
  c.Play_LiveUseHls=false;c.Play_playingUrl='https://example.invalid/live.m3u8';
  c.Play_avplay.getState=()=> 'IDLE';c.Play_PlayNativeLive(c.Play_playingUrl);
  assert.equal(stats.timerDelays[0],15000);
  const lateSuccess=stats.pendingReady[0];stats.timers[0]();
  assert.equal(c.Play_LiveUseHls,true);assert.ok(stats.videoPlay>0);
  lateSuccess();assert.equal(stats.nativePlay,0);
});
check('Forced Native reports unsupported format without silently changing backend',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_NATIVE;c.Play_LiveUseHls=false;
  c.Play_StartupRetryUsed=true;
  c.Play_playingUrl='https://example.invalid/live.m3u8';
  c.Play_PlayNativeLive(c.Play_playingUrl);
  c.Play_listener.onerror('PLAYER_ERROR_NOT_SUPPORTED_FORMAT');
  assert.equal(c.Play_LiveUseHls,false);assert.equal(c.hls,null);assert.equal(stats.terminal,1);assert.equal(stats.warning,1);
  stats.pendingReady[0]();stats.timers[0]();assert.equal(stats.nativePlay,0);assert.equal(stats.terminal,1);
});
check('Obsolete Auto playlist requests cannot restart an earlier quality or closed channel',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_AUTO;
  c.Play_playingUrl='https://example.invalid/720.m3u8';c.Play_AutoSelectPlayer(c.Play_playingUrl);
  const old=stats.requests[0];c.Play_playingUrl='https://example.invalid/1080.m3u8';c.Play_AutoSelectPlayer(c.Play_playingUrl);
  assert.ok(old.aborted);old.respond('#EXTM3U\n#EXTINF:2,\nsegment.ts');assert.equal(stats.prepare,0);
  c.Play_InvalidateSession();stats.requests[1].respond('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nsegment.mp4');
  assert.equal(stats.videoPlay,0);assert.equal(stats.prepare,0);
});
check('Auto can use HLS when playlist detection fails; HLS mode does not need a preflight request',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_AUTO;
  c.Play_playingUrl='https://example.invalid/live.m3u8';c.Play_onPlayer();stats.requests[0].ontimeout();
  assert.equal(c.Play_LiveUseHls,true);assert.ok(stats.videoPlay>0);
  c.Play_PlayerMode=c.Play_PLAYER_HLS;c.Play_LiveUseHls=true;const requests=stats.requests.length;
  c.Play_onPlayer();assert.equal(stats.requests.length,requests);
});
check('Player initialization keeps Auto on a clean install and preserves saved modes and accounts',()=>{
  for(const [saved,expected] of [[null,1],['2',1],['1',0],['3',2]]) {
    const {c}=env(),noop=()=>{};
    const stored=new Map([['AddUser_UsernameArray','TEST_ACCOUNT_STATE']]);
    if(saved!==null)stored.set('player_mode',saved);
    c.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
    vm.runInContext(read('app/specific/Settings.js'),c);
    const main=read('app/specific/Main.js');
    for(const name of ['Main_getItemInt','Main_getItemBool']) {
      vm.runInContext(main.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0],c);
    }
    for(const name of ['Settings_SetBuffers','Settings_SetClock','Main_SetThumb','Settings_SetAnimations',
      'Settings_ShowCounter','Settings_proxy_set_start','Settings_set_http','Play_ChatSize','Play_ChatBackgroundChange','Play_SetChatFont'])c[name]=noop;
    c.PlaybackDiagnostics.setEnabled=noop;c.Main_getElementById=id=>c.document.getElementById(id);
    c.tizen={systeminfo:{getCapability:()=> '2.4.0'}};c.webapis.avplay=c.Play_avplay;c.webapis.preview={setPreviewData:noop};
    c.IMG_404_LOGO='';c.AddCode_clientId='example-client';c.AddCode_client_backup='example-client';
    c.Main_AcceptHeader='Accept';c.Main_TwitchV5Json='application/json';c.Main_Authorization='Authorization';
    c.Settings_SetDefautls();c.Play_PreStart();
    assert.equal(c.Play_PlayerMode,expected,'Player mode after full initialization, saved='+saved);
    assert.equal(c.Settings_Obj_default('player_mode'),expected);
    assert.equal(stored.get('AddUser_UsernameArray'),'TEST_ACCOUNT_STATE');
  }
});
check('Five timestamped errors stay in memory, include sanitized exception text and reset after restart',()=>{
  const {c,stats}=env();const stored=new Map([['playback_error_history','OLD_HISTORY'],['account','TEST_ACCOUNT_STATE']]);
  c.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
  vm.runInContext(read('app/general/PlaybackDiagnostics.js'),c);
  for(let i=0;i<7;i++)c.PlaybackDiagnostics.error('HLS','error_'+i,new Error('Cannot append fragment '+i));
  assert.equal(stored.has('playback_error_history'),false);assert.equal(stored.get('account'),'TEST_ACCOUNT_STATE');
  assert.equal(stats.logs.length,0);assert.equal(stats.intervals.size,0);
  c.Play_isOn=true;c.PlaybackDiagnostics.setEnabled(true);
  const current=c.document.getElementById('playback_debug');
  assert.match(current.textContent,/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \| HLS \| error_2/);
  assert.equal((current.textContent.match(/\| HLS \| error_/g)||[]).length,5);
  assert.ok(current.textContent.includes('Error: Cannot append fragment 6'));
  c.PlaybackDiagnostics.setEnabled(false);
  c.PlaybackDiagnostics.error('HLS','internalException',new Error('Failure https://example.invalid/?token=URL_SECRET token=TEST_SECRET Authorization: Bearer BEARER_SECRET'));
  c.PlaybackDiagnostics.setEnabled(true);
  assert.ok(current.textContent.includes('internalException'));assert.ok(current.textContent.includes('[URL]'));
  assert.ok(!/URL_SECRET|TEST_SECRET|BEARER_SECRET/.test(current.textContent));
  const next=env().c;next.localStorage=c.localStorage;
  next.tizen={application:{getAppInfo:()=>({version:'4.0.8'})},systeminfo:{getCapability:()=> 'TEST_TIZEN'}};
  next.webapis.productinfo={getModel:()=> 'TEST_TV_MODEL'};
  vm.runInContext(read('app/general/PlaybackDiagnostics.js'),next);
  next.Play_isOn=true;next.PlaybackDiagnostics.setEnabled(true);
  const overlay=next.document.getElementById('playback_debug');
  assert.ok(overlay.textContent.includes('APP: 4.0.8 | TV: TEST_TV_MODEL | Tizen: TEST_TIZEN'));
  assert.ok(!overlay.textContent.includes('Last errors'));
});
check('Native startup uses the timeout selected in settings',()=>{
  const {c,stats}=env();vm.runInContext(read('app/specific/Settings.js'),c);
  c.Settings_value.native_prepare_timeout.defaultValue=3;
  c.Settings_SetDefault('native_prepare_timeout');
  c.Play_isOn=true;c.Play_PlayerMode=c.Play_PLAYER_AUTO;c.Play_LiveUseHls=false;
  c.Play_PlayNativeLive('https://example.invalid/live.m3u8');
  assert.equal(stats.timerDelays[0],30000);
});
check('HLS internal exceptions pass their message to the diagnostic history',()=>{
  const {c}=env();const errors=[];c.PlaybackDiagnostics.error=(...args)=>errors.push(args);
  c.Play_isOn=true;c.Play_LiveUseHls=true;c.Play_PlayHLSUrl('https://example.invalid/live.m3u8');
  const error=new Error('Failed to parse fragment');
  c.hls.trigger(realHls.Events.ERROR,{type:realHls.ErrorTypes.OTHER_ERROR,details:'internalException',fatal:false,error});
  assert.equal(errors[0][0],'HLS');assert.equal(errors[0][1],'internalException');assert.equal(errors[0][2],error);
});
check('A fatal startup error reloads once, retains diagnostics and ignores obsolete callbacks',()=>{
  const {c,stats}=env();vm.runInContext(read('app/general/PlaybackDiagnostics.js'),c);
  c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();const old=c.hls;
  let reload=0;c.Play_ReloadLive=automatic=>{assert.equal(automatic,true);reload++;};
  const error={fatal:true,type:c.Hls.ErrorTypes.OTHER_ERROR,details:'internalException',error:new Error('Startup fixture exception')};
  old.trigger(c.Hls.Events.ERROR,error);
  assert.equal(c.Play_StartupRetryUsed,true);assert.equal(stats.warning,0);assert.equal(stats.terminal,0);
  const retry=stats.timers.at(-1);old.trigger(c.Hls.Events.ERROR,error);retry();assert.equal(reload,1);
  c.initHLSPlayer();c.hls.trigger(c.Hls.Events.ERROR,error);
  assert.equal(stats.terminal,1);assert.equal(stats.warning,1);
  c.PlaybackDiagnostics.setEnabled(true);
  assert.ok(c.document.getElementById('playback_debug').textContent.includes('Startup fixture exception'));
  const stopped=env();stopped.c.Play_isOn=true;stopped.c.Play_LiveUseHls=true;stopped.c.initHLSPlayer();
  stopped.c.hls.trigger(stopped.c.Hls.Events.ERROR,error);const late=stopped.stats.timers.at(-1);
  stopped.c.Play_InvalidateSession();stopped.c.Play_ReloadLive=()=>{throw new Error('Restarted a closed channel');};late();
});
check('Successful playback prevents automatic Reload on a later fatal error',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  c.Play_avplay_hls_player.dispatch('playing');
  c.hls.trigger(c.Hls.Events.ERROR,{fatal:true,type:c.Hls.ErrorTypes.OTHER_ERROR,details:'internalException'});
  assert.equal(c.Play_HasStarted,true);assert.equal(c.Play_StartupRetryUsed,false);assert.equal(stats.terminal,1);
});
check('HLS live pause stops loading and Play resumes from the same buffered position',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  const video=c.Play_avplay_hls_player;video.currentTime=25;video.paused=false;
  c.Play_KeyPause(1);assert.equal(video.paused,true);assert.equal(stats.stopLoad,1);assert.equal(video.currentTime,25);
  c.Play_KeyPause(1);assert.equal(video.paused,false);assert.equal(c.hls.startPosition,25);
  c.PlayVod_isOn=true;c.PlayVod_useHls=true;const stops=stats.stopLoad;c.Play_KeyPause(2);assert.equal(stats.stopLoad,stops);
});
check('To live seeks after a fresh playlist update and is unavailable for Native or VOD',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();
  const player=c.hls,video=c.Play_avplay_hls_player;player.latestLevelDetails={live:true};player.liveSyncPosition=90;
  video.currentTime=25;video.paused=true;c.Play_UpdateGoLiveButton();
  assert.equal(c.document.getElementById('to_live_button').style.display,'inline-block');
  c.Play_GoLive();assert.equal(c.Play_GoLivePending,true);assert.equal(video.currentTime,25);
  player.liveSyncPosition=110;player.trigger(c.Hls.Events.LEVEL_UPDATED,{});
  assert.equal(video.currentTime,110);assert.equal(video.paused,false);assert.equal(c.Play_GoLivePending,false);assert.equal(stats.destroy,0);
  c.Play_LiveUseHls=false;c.Play_UpdateGoLiveButton();assert.equal(c.document.getElementById('to_live_button').style.display,'none');
  c.Play_GoLive();assert.equal(c.Play_GoLivePending,false);
  c.Play_LiveUseHls=true;c.PlayVod_isOn=true;c.Play_UpdateGoLiveButton();assert.equal(c.Play_CanGoLive(),false);
  c.PlayVod_isOn=false;c.Play_GoLive();c.Play_InvalidateSession();player.liveSyncPosition=150;
  player.trigger(c.Hls.Events.LEVEL_UPDATED,{});assert.equal(video.currentTime,110);
});
check('Live controls navigate Play, Reload and To live while Native skips To live',()=>{
  const {c}=env();c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();c.hls.latestLevelDetails={live:true};
  c.PlayVod_PanelY=1;c.PlayClip_EnterPos=0;c.KEY_LEFT=37;c.KEY_RIGHT=39;c.KEY_ENTER=13;
  c.UserLiveFeed_isFeedShow=()=>false;c.Play_isPanelShown=()=>true;let seek=0;c.Play_GoLive=()=>seek++;
  c.Play_handleKeyDown({keyCode:39});assert.equal(c.Play_ReloadFocused,true);
  c.Play_handleKeyDown({keyCode:39});assert.equal(c.Play_ToLiveFocused,true);
  assert.ok(c.document.getElementById('to_live_button').classList.contains('progress_bar_div_focus'));
  c.Play_handleKeyDown({keyCode:13});assert.equal(seek,1);
  c.Play_handleKeyDown({keyCode:37});assert.equal(c.Play_ToLiveFocused,false);assert.equal(c.Play_ReloadFocused,true);
  c.Play_handleKeyDown({keyCode:37});assert.equal(c.Play_ReloadFocused,false);
  c.Play_LiveUseHls=false;c.Play_handleKeyDown({keyCode:39});c.Play_handleKeyDown({keyCode:39});assert.equal(c.Play_ToLiveFocused,false);
});
check('Clip playback reactivates error handling after a previous player was stopped',()=>{
  const {c,stats}=env();vm.runInContext(read('app/specific/PlayClip.js'),c);
  c.Play_EndSet=()=>{};
  c.Play_isOn=true;c.Play_LiveUseHls=true;c.initHLSPlayer();c.Play_offPlayer();
  c.Play_isOn=false;c.PlayClip_isOn=true;c.PlayClip_playingUrl='https://example.invalid/clip.mp4';
  const errors=[];c.PlaybackDiagnostics.error=(...args)=>errors.push(args);
  c.PlayClip_onPlayer();const plays=stats.videoPlay,video=c.Play_avplay_hls_player;
  video.error={code:2};video.onerror();
  assert.equal(errors.length,1);assert.equal(c.Play_onPlayerCounter,1);assert.equal(stats.videoPlay,plays+1);
  video.onerror();video.onerror();assert.equal(stats.terminal,1);
});
check('A failed logo request retries the request and accepts its successful response',()=>{
  const {c,stats}=env();c.Play_isOn=true;c.Main_helix_api='https://example.invalid/';
  const requests=[];c.BasexmlHttpGet=(...args)=>requests.push(args);c.Play_partnerIcon=()=>{};c.IMG_404_LOGO='';
  c.Play_updateStreamLogo();requests[0][5]();stats.timers.at(-1)();assert.equal(requests.length,2);
  requests[1][4](JSON.stringify({data:[{broadcaster_type:'',profile_image_url:'https://example.invalid/logo.png'}]}));
  assert.equal(c.Play_LoadLogoSucess,true);
  assert.equal(c.document.getElementById('stream_info_icon').src,'https://example.invalid/logo.png');
});
check('Tizen 2.4 keeps the original HLS config in both latency modes; Tizen 3 enables conversion',()=>{
  const {c}=env();
  for(const version of ['2.4.0',2.4,undefined,'unknown','3.0',3]) {
    c.Play_TizenVersion=version;
    for(const lowLatency of [false,true]) {
      c.Play_LowLatency=lowLatency;
      const config=c.Play_GetHlsConfig();
      const enabled=parseFloat(version)>=3;
      assert.equal(Object.hasOwn(config,'fLoader'),enabled);
      if(enabled) { assert.equal(config.fLoader,c.Fmp4ToTsLoader);delete config.fLoader; }
      assert.deepEqual(JSON.parse(JSON.stringify(config)),{
        enableWorker:false,lowLatencyMode:lowLatency,
        liveSyncDurationCount:lowLatency?2:3,liveMaxLatencyDurationCount:lowLatency?4:6
      });
    }
  }
});
check('Fragment loader converts media, preserves init/parts/TS/failures and forwards loader callbacks',()=>{
  const {c}=env();let conversions=0,aborted=0,destroyed=0;
  const stats={loaded:4};const network={fixture:true};
  const original=new Uint8Array([1,2,3,4]).buffer;
  const ts=new Uint8Array([0x47,0,0,0]);
  let throwConversion=false;
  c.PlayHlsRemux_GetInit=()=>({tracks:{}});
  c.PlayHlsRemux_FragmentToTs=()=>{conversions++;if(throwConversion)throw Error('Fixture conversion error');return ts;};
  c.Hls.DefaultConfig={loader:class {
    constructor() { this.stats=stats; }
    load(context,config,callbacks) {
      callbacks.onProgress(stats,context,original,network);
      callbacks.onSuccess({data:original},stats,context,network);
    }
    abort() { aborted++; }
    destroy() { destroyed++; }
    getCacheAge() { return 5; }
    getResponseHeader(name) { return name==='Content-Type'?'video/mp4':null; }
  }};
  const loader=new c.Fmp4ToTsLoader({});assert.equal(loader.stats,stats);
  const media={frag:{sn:1,initSegment:{data:new Uint8Array([0])}}};
  const init={frag:{sn:'initSegment'}};
  const part={frag:media.frag,part:{index:0}};
  const plainTs={frag:{sn:2}};
  for(const context of [media,init,part,plainTs]) {
    let response,progress=0;
    loader.load(context,{}, {
      onProgress(s,ctx,data,net) { assert.equal(s,stats);assert.equal(ctx,context);assert.equal(data,original);assert.equal(net,network);progress++; },
      onSuccess(r,s,ctx,net) { response=r;assert.equal(s,stats);assert.equal(ctx,context);assert.equal(net,network); }
    });
    assert.equal(response.data,context===media?ts.buffer:original);assert.equal(progress,1);
    assert.equal(loader.context,context);
  }
  assert.equal(conversions,1);
  throwConversion=true;
  loader.load(media,{}, {onProgress(){},onSuccess(r){assert.equal(r.data,original);}});
  assert.equal(loader.getCacheAge(),5);assert.equal(loader.getResponseHeader('Content-Type'),'video/mp4');
  loader.abort();loader.destroy();assert.equal(aborted,1);assert.equal(destroyed,1);
});
const failed=results.filter(r=>r.status==='FAIL').length;
const report={kind:'offline mocked unit checks',project:path.basename(root),
  hlsVersion:realHls.version,total:results.length,passed:results.length-failed,failed,results};
for(const r of results)console.log(`${r.status}: ${r.name}\n  ${r.error||JSON.stringify(r.evidence)}`);
console.log(`\n${report.total} checks: ${report.passed} PASS, ${report.failed} FAIL.`);
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
process.exitCode=failed?1:0;
