// Merge followed channels' recordings by date without loading their full histories.
var UserVod_feed = null;

function UserVod_Cancel() {
    var feed = UserVod_feed;
    UserVod_feed = null;
    if (!feed) return;
    for (var i = 0; i < feed.requests.length; i++) feed.requests[i].abort();
    for (var j = 0; j < feed.timers.length; j++) window.clearTimeout(feed.timers[j]);
    UserVod.status = false;
}

function UserVod_Load() {
    var user = AddUser_UsernameArray[0];
    if (!UserVod_feed) UserVod_feed = {user: user, channels: [], followsDone: false, requests: [], timers: [], busy: false};
    var feed = UserVod_feed;
    if (feed.busy || feed.failed) return;
    feed.busy = true;
    var page = [];

    function active() {
        return UserVod_feed === feed && inUseObj === UserVod && AddUser_UsernameArray[0] === user && !feed.failed;
    }
    function fail() {
        if (!active()) return;
        feed.failed = true;
        feed.busy = false;
        for (var i = 0; i < feed.requests.length; i++) feed.requests[i].abort();
        for (var j = 0; j < feed.timers.length; j++) window.clearTimeout(feed.timers[j]);
        Screens_loadDatafail();
    }
    function request(url, callback, attempt, refreshed) {
        if (!active()) return;
        var xhr = new XMLHttpRequest();
        feed.requests.push(xhr);
        xhr.open('GET', url, true);
        xhr.timeout = 10000;
        xhr.setRequestHeader('Client-ID', Main_Bearer_User_Headers[0][1]);
        xhr.setRequestHeader('Authorization', Main_Bearer + user.access_token);
        xhr.onreadystatechange = function () {
            if (!active() || xhr.readyState !== 4) return;
            var index = feed.requests.indexOf(xhr);
            if (index !== -1) feed.requests.splice(index, 1);
            if (xhr.status === 200) {
                var result;
                try { result = JSON.parse(xhr.responseText); } catch (error) { fail(); return; }
                if (!result || !Array.isArray(result.data) || !result.pagination) { fail(); return; }
                callback(result);
            } else if (xhr.status === 401 && !refreshed) {
                AddCode_refreshTokens(0, 0, function () { request(url, callback, attempt, true); }, fail);
            } else if ((xhr.status === 0 || xhr.status === 429 || xhr.status >= 500) && attempt < 2) {
                var delay = 1000 * (attempt + 1);
                if (xhr.status === 429) {
                    var reset = Number(xhr.getResponseHeader('Ratelimit-Reset')) * 1000;
                    delay = Math.max(delay, reset - new Date().getTime() + 250);
                }
                var timer = window.setTimeout(function () {
                    var pos = feed.timers.indexOf(timer);
                    if (pos !== -1) feed.timers.splice(pos, 1);
                    request(url, callback, attempt + 1, refreshed);
                }, delay);
                feed.timers.push(timer);
            } else fail();
        };
        xhr.send(null);
    }
    function follows(cursor) {
        request(Main_helix_api + 'channels/followed?first=100&user_id=' + encodeURIComponent(user.id) +
            (cursor ? '&after=' + encodeURIComponent(cursor) : ''), function (result) {
            for (var i = 0; i < result.data.length; i++) {
                feed.channels.push({id: result.data[i].broadcaster_id, videos: [], cursor: '', loaded: false, loading: false});
            }
            if (result.pagination.cursor) follows(result.pagination.cursor);
            else { feed.followsDone = true; fill(); }
        }, 0, false);
    }
    function fill() {
        if (!active()) return;
        var pending = 0, waiting = false;
        for (var i = 0; i < feed.channels.length; i++) if (feed.channels[i].loading) pending++;
        for (var j = 0; j < feed.channels.length; j++) {
            var channel = feed.channels[j];
            if (channel.videos.length || (channel.loaded && !channel.cursor)) continue;
            waiting = true;
            if (channel.loading || pending >= 3) continue;
            channel.loading = true;
            pending++;
            loadChannel(channel);
        }
        if (!waiting) merge();
    }
    function loadChannel(channel) {
        request(Main_helix_api + 'videos?first=10&type=archive&sort=time&user_id=' + encodeURIComponent(channel.id) +
            (channel.cursor ? '&after=' + encodeURIComponent(channel.cursor) : ''), function (result) {
            channel.videos = result.data;
            channel.cursor = result.pagination.cursor || '';
            channel.loaded = true;
            channel.loading = false;
            fill();
        }, 0, false);
    }
    function merge() {
        var best = null;
        for (var i = 0; i < feed.channels.length; i++) {
            var channel = feed.channels[i];
            if (channel.videos.length && (!best || channel.videos[0].created_at > best.videos[0].created_at ||
                (channel.videos[0].created_at === best.videos[0].created_at && channel.videos[0].id > best.videos[0].id))) best = channel;
        }
        if (!best || page.length >= Main_ItemsLimitMax) {
            var first = UserVod.data === null;
            UserVod.data = (UserVod.data || []).concat(page);
            UserVod.offset = UserVod.data.length;
            UserVod.dataEnded = !best;
            feed.busy = false;
            if (first) UserVod.loadDataSuccess();
            UserVod.loadingData = false;
            return;
        }
        page.push(best.videos.shift());
        fill();
    }
    if (!feed.followsDone) follows('');
    else fill();
}
