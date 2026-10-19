// Optional Twitch device-code login. The original authorization-code flow stays in AddCode.js.
var AddCode_LoginMethod = 'choice';
var AddCode_MethodIndex = 0;
var AddCode_AddingUser = false;
var AddCode_Device = null;
var AddCode_DeviceSession = 0;
var AddCode_DeviceXHR = null;
var AddCode_DevicePollId = null;
var AddCode_DeviceTickId = null;

function AddCode_ShowMethods(addingUser) {
    AddCode_AddingUser = addingUser === true;
    AddCode_DeviceStop();
    AddCode_LoginMethod = 'choice';
    AddCode_MethodIndex = 0;
    AddCode_loadingData = false;
    Main_CounterDialogRst();
    Main_HideWarningDialog();
    ScreensObj_SetTopLable(STR_USER_CODE);
    Main_ShowElement('oauth_scroll');
    Main_ShowElement('oauth_methods');
    Main_HideElement('oauth_device');
    Main_HideElement('oauth_text');
    Main_HideElement('oauth_input');
    Main_textContent('oauth_methods_title', STR_LOGIN_METHOD);
    Main_textContent('oauth_method_device', STR_LOGIN_DEVICE);
    Main_textContent('oauth_method_legacy', STR_LOGIN_LEGACY);
    AddCode_MethodFocus();
    document.body.removeEventListener('keydown', AddCode_handleKeyDown);
    document.body.addEventListener('keydown', AddCode_handleKeyDown, false);
}

function AddCode_MethodFocus() {
    Main_RemoveClass('oauth_method_device', 'oauth_method_focus');
    Main_RemoveClass('oauth_method_legacy', 'oauth_method_focus');
    Main_AddClass(AddCode_MethodIndex ? 'oauth_method_legacy' : 'oauth_method_device', 'oauth_method_focus');
}

function AddCode_MethodKeyDown(event) {
    var key = event.keyCode;
    if (key === KEY_RETURN) {
        if (Main_isControlsDialogShown()) Main_HideControlsDialog();
        else if (Main_isAboutDialogShown()) Main_HideAboutDialog();
        else if (AddCode_LoginMethod === 'device') AddCode_ShowMethods();
        else {
            Main_values.Main_Go = AddCode_AddingUser && !AddUser_UsernameArray.length ? Main_Live : Main_Users;
            AddCode_exit();
            Main_SwitchScreen();
        }
    } else if (AddCode_LoginMethod === 'choice') {
        if (key === KEY_UP || key === KEY_LEFT) AddCode_MethodIndex = 0;
        else if (key === KEY_DOWN || key === KEY_RIGHT) AddCode_MethodIndex = 1;
        else if (key === KEY_ENTER) {
            if (AddCode_AddingUser) {
                AddUser_LoginMethod = AddCode_MethodIndex ? 'legacy' : 'device';
                AddCode_exit();
                AddUser_NameInit();
            } else if (AddCode_MethodIndex) AddCode_LegacyInit();
            else AddCode_DeviceStart();
            return;
        }
        AddCode_MethodFocus();
    } else if (key === KEY_ENTER && !AddCode_Device && !AddCode_DeviceXHR) AddCode_DeviceStart();
}

function AddCode_DeviceStop() {
    AddCode_DeviceSession++;
    window.clearTimeout(AddCode_DevicePollId);
    window.clearInterval(AddCode_DeviceTickId);
    AddCode_DevicePollId = AddCode_DeviceTickId = null;
    AddCode_Device = null;
    var request = AddCode_DeviceXHR;
    AddCode_DeviceXHR = null;
    if (request) request.abort();
}

function AddCode_DeviceFail(message) {
    AddCode_DeviceStop();
    Main_textContent('oauth_device_code', '');
    Main_textContent('oauth_device_link', '');
    Main_textContent('oauth_device_time', '');
    Main_textContent('oauth_device_status', message + ' ' + STR_LOGIN_RETRY);
}

function AddCode_DeviceRequest(method, url, body, session, callback, token) {
    var request = new XMLHttpRequest(), done = false;
    AddCode_DeviceXHR = request;
    function finish() {
        if (done || session !== AddCode_DeviceSession) return;
        done = true;
        if (AddCode_DeviceXHR === request) AddCode_DeviceXHR = null;
        callback(request);
    }
    request.onreadystatechange = function () { if (request.readyState === 4) finish(); };
    request.onerror = request.ontimeout = finish;
    try {
        request.open(method, url, true);
        request.timeout = AddCode_loadingDataTimeout;
        if (body !== null) request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        if (token) request.setRequestHeader('Authorization', 'OAuth ' + token);
        request.send(body);
    } catch (error) { finish(); }
}

function AddCode_DeviceResponse(request) {
    try { return JSON.parse(request.responseText); } catch (ignore) { return null; }
}

function AddCode_DeviceScopes() {
    return 'client_id=' + encodeURIComponent(AddCode_clientId) + '&scopes=' + encodeURIComponent(AddCode_Scopes.join(' '));
}

function AddCode_DeviceStart() {
    var username = AddUser_UsernameArray[Main_values.Users_AddcodePosition].name;
    AddCode_DeviceStop();
    AddCode_LoginMethod = 'device';
    Main_HideElement('oauth_methods');
    Main_ShowElement('oauth_device');
    Main_textContent('oauth_device_instructions', STR_LOGIN_DEVICE_INSTRUCTIONS);
    Main_textContent('oauth_device_user', username);
    Main_textContent('oauth_device_code', '');
    Main_textContent('oauth_device_link', '');
    Main_textContent('oauth_device_time', '');
    Main_textContent('oauth_device_status', STR_LOGIN_LOADING);
    var session = AddCode_DeviceSession;
    AddCode_DeviceRequest('POST', 'https://id.twitch.tv/oauth2/device', AddCode_DeviceScopes(), session, function (request) {
        var data = AddCode_DeviceResponse(request);
        if (request.status !== 200 || !data || typeof data.device_code !== 'string' || !data.device_code ||
            typeof data.user_code !== 'string' || !data.user_code || !(Number(data.expires_in) > 0)) {
            AddCode_DeviceFail(STR_LOGIN_FAILED);
            return;
        }
        AddCode_Device = {username: username, code: data.device_code,
            interval: Math.max(1, Number(data.interval) || 5) * 1000,
            expires: new Date().getTime() + Number(data.expires_in) * 1000};
        Main_textContent('oauth_device_code', data.user_code);
        Main_textContent('oauth_device_link', data.verification_uri || 'https://www.twitch.tv/activate');
        Main_textContent('oauth_device_status', STR_LOGIN_WAITING);
        AddCode_DeviceTick();
        AddCode_DeviceTickId = window.setInterval(AddCode_DeviceTick, 1000);
        AddCode_DevicePollId = window.setTimeout(AddCode_DevicePoll, AddCode_Device.interval);
    });
}

function AddCode_DeviceTick() {
    if (!AddCode_Device) return;
    var left = Math.ceil((AddCode_Device.expires - new Date().getTime()) / 1000);
    if (left <= 0) { AddCode_DeviceFail(STR_LOGIN_EXPIRED); return; }
    Main_textContent('oauth_device_time', STR_LOGIN_TIME_LEFT + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2));
}

function AddCode_DevicePoll() {
    if (!AddCode_Device) return;
    var session = AddCode_DeviceSession;
    AddCode_DeviceRequest('POST', 'https://id.twitch.tv/oauth2/token', AddCode_DeviceScopes() +
        '&device_code=' + encodeURIComponent(AddCode_Device.code) +
        '&grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code'), session, function (request) {
        var data = AddCode_DeviceResponse(request);
        if (request.status === 200) {
            if (!data || typeof data.access_token !== 'string' || !data.access_token ||
                typeof data.refresh_token !== 'string' || !data.refresh_token || !(Number(data.expires_in) > 0)) {
                AddCode_DeviceFail(STR_LOGIN_FAILED);
                return;
            }
            Main_textContent('oauth_device_status', STR_LOGIN_VERIFYING);
            AddCode_DeviceValidate(data, session);
            return;
        }
        var error = data && (data.message || data.error);
        if (error === 'slow_down' || request.status === 429) AddCode_Device.interval += 5000;
        else if (error !== 'authorization_pending' && request.status !== 0 && request.status < 500) {
            AddCode_DeviceFail(error === 'expired_token' ? STR_LOGIN_EXPIRED : STR_LOGIN_FAILED);
            return;
        }
        AddCode_DevicePollId = window.setTimeout(AddCode_DevicePoll, AddCode_Device.interval);
    });
}

function AddCode_DeviceValidate(tokens, session) {
    AddCode_DeviceRequest('GET', 'https://id.twitch.tv/oauth2/validate', null, session, function (request) {
        var data = AddCode_DeviceResponse(request), username = AddCode_Device.username;
        if (request.status !== 200 || !data || data.client_id !== AddCode_clientId ||
            !Array.isArray(data.scopes) || !AddCode_TokensCheckScope(data.scopes)) {
            AddCode_DeviceFail(STR_LOGIN_FAILED);
            return;
        }
        if (typeof data.login !== 'string' || data.login.toLowerCase() !== username.toLowerCase()) {
            AddCode_DeviceFail(STR_OAUTH_FAIL_USER + username);
            return;
        }
        var position = AddUser_UserFindpos(username);
        if (position < 0) { AddCode_DeviceFail(STR_LOGIN_FAILED); return; }
        var user = AddUser_UsernameArray[position];
        user.access_token = tokens.access_token;
        user.refresh_token = tokens.refresh_token;
        user.expires_in = Number(tokens.expires_in);
        AddUser_SaveUserArray();
        AddCode_Refreshtimeout(AddUser_UserFindpos(username));
        AddCode_exit();
        Main_newUsercode = 0;
        Users_status = false;
        Main_values.Main_Go = Main_Users;
        Main_SaveValues();
        Users_init();
        Main_showWarningDialog(STR_USER_CODE_OK);
        window.setTimeout(Main_HideWarningDialog, 3000);
    }, tokens.access_token);
}
