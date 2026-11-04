'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env() {
  const pending=[],timers=[];let max=0,finished=0,errors=0;
  function XHR(){this.headers={};}
  XHR.prototype.open=function(method,url){this.url=new URL(url);};
  XHR.prototype.setRequestHeader=function(key,value){this.headers[key]=value;};
  XHR.prototype.send=function(){pending.push(this);max=Math.max(max,pending.length);};
  XHR.prototype.reply=function(data,status=200){this.status=status;this.readyState=4;this.responseText=JSON.stringify(data);this.onreadystatechange();};
  XHR.prototype.abort=function(){this.aborted=true;this.reply({},0);};
  const screen={data:null,loadingData:true,status:false,loadDataSuccess:()=>finished++};
  const c={UserVod:screen,inUseObj:screen,AddUser_UsernameArray:[{id:'viewer',access_token:'example-access'}],
    Main_ItemsLimitMax:4,Main_helix_api:'https://example.invalid/',Main_Bearer:'Bearer ',
    Main_Bearer_User_Headers:[['Client-ID','example-client']],XMLHttpRequest:XHR,
    Screens_loadDatafail:()=>errors++,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}};
  c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('app/specific/UserVod.js','utf8'),c);
  return {c,pending,timers,get max(){return max;},get finished(){return finished;},get errors(){return errors;}};
}
const videos={a:[99,89,79,69,59,49],b:[95,85,75,65,55],c:[],d:[100,80,60,40]};
function respond(req){
  const p=req.url.searchParams,cursor=Number(p.get('after')||0);
  if(req.url.pathname==='/channels/followed') {
    const ids=cursor?['c','d']:['a','b'];
    req.reply({data:ids.map(id=>({broadcaster_id:id})),pagination:cursor?{}:{cursor:'1'}});
  } else {
    const id=p.get('user_id'),all=videos[id],page=all.slice(cursor,cursor+2);
    assert.equal(p.get('type'),'archive');assert.equal(p.get('sort'),'time');
    req.reply({data:page.map(n=>({id:id+n,created_at:new Date(n*1000).toISOString()})),
      pagination:cursor+2<all.length?{cursor:String(cursor+2)}:{}});
  }
}
{
  const e=env();e.c.UserVod_Load();let count=0;
  while(!e.c.UserVod.dataEnded) {
    while(e.pending.length){assert.ok(++count<100);respond(e.pending.pop());}
    if(!e.c.UserVod.dataEnded)e.c.UserVod_Load();
  }
  const actual=Array.from(e.c.UserVod.data,v=>v.id);
  const expected=Object.entries(videos).flatMap(([id,ns])=>ns.map(n=>({id:id+n,n}))).sort((a,b)=>b.n-a.n).map(v=>v.id);
  assert.deepEqual(actual,expected);assert.ok(e.max<=3);assert.equal(e.finished,1);assert.equal(e.errors,0);
  console.log('PASS: followed-channel pagination, empty channels, global date order and VOD pagination; at most three requests.');
}
{
  const e=env();e.c.UserVod_Load();e.pending.pop().reply({data:[],pagination:{}});
  assert.equal(e.c.UserVod.dataEnded,true);assert.equal(e.c.UserVod.data.length,0);assert.equal(e.finished,1);
  console.log('PASS: empty Follow list finishes loading.');
}
{
  const e=env();e.c.UserVod_Load();const req=e.pending.pop();req.reply({},503);
  assert.equal(e.timers.length,1);e.timers.shift()();assert.equal(e.pending.length,1);
  const old=e.pending.pop();e.c.UserVod_Cancel();assert.ok(old.aborted);
  old.reply({data:[{broadcaster_id:'stale'}],pagination:{}});
  assert.equal(e.c.UserVod_feed,null);assert.equal(e.pending.length,0);assert.equal(e.errors,0);
  console.log('PASS: bounded retry and cancelled requests reject late replies.');
}
{
  const e=env();let refreshed=0;e.c.AddCode_refreshTokens=(pos,tries,ok)=>{refreshed++;ok();};
  e.c.UserVod_Load();e.pending.pop().reply({},401);assert.equal(refreshed,1);
  e.pending.pop().reply({},401);assert.equal(e.errors,1);
  const other=env();other.c.UserVod_Load();const req=other.pending.pop();
  other.c.AddUser_UsernameArray[0]={id:'other',access_token:'example-other'};
  req.reply({data:[{broadcaster_id:'stale'}],pagination:{}});assert.equal(other.pending.length,0);
  console.log('PASS: one token refresh and stale account replies do not change the feed.');
}
