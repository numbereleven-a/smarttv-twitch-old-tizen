// ES2016 helpers missing from the Tizen 2.4 WebKit runtime.
(function () {
    if (!Array.prototype.includes) {
        Object.defineProperty(Array.prototype, 'includes', {
            configurable: true,
            writable: true,
            value: function (value, fromIndex) {
                'use strict';
                if (this == null) throw new TypeError('Array.includes called on null');
                var array = Object(this);
                var length = Math.min(Math.max(Math.floor(Number(array.length) || 0), 0), 9007199254740991);
                var start = Number(fromIndex) || 0;
                start = start < 0 ? Math.ceil(start) : Math.floor(start);
                if (start < 0) start = Math.max(length + start, 0);
                for (var i = start; i < length; i++) {
                    var item = array[i];
                    if (item === value || (item !== item && value !== value)) return true;
                }
                return false;
            }
        });
    }
    if (!String.prototype.includes) {
        Object.defineProperty(String.prototype, 'includes', {
            configurable: true,
            writable: true,
            value: function (search, position) {
                'use strict';
                if (this == null) throw new TypeError('String.includes called on null');
                if (Object.prototype.toString.call(search) === '[object RegExp]') throw new TypeError('Expected a string');
                return String(this).indexOf(String(search), position || 0) !== -1;
            }
        });
    }
}());
