const moment = require("moment");
const crypto = require('crypto');

class MD5 {
    static hex_chr() {
        return "0123456789ABCDEF";
    }

    static rhex(num) {
        let str = "";
        for (let j = 0; j <= 3; j++) {
            str += this.hex_chr().charAt((num >> (j * 8 + 4)) & 0x0F) +
                this.hex_chr().charAt((num >> (j * 8)) & 0x0F);
        }
        return str;
    }

    static str2blks_MD5(str) {
        let nblk = ((str.length + 8) >> 6) + 1;
        let blks = new Array(nblk * 16);
        let i = 0;
        for (i = 0; i < nblk * 16; i++) blks[i] = 0;
        for (i = 0; i < str.length; i++) {
            blks[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
        }
        blks[i >> 2] |= 0x80 << ((i % 4) * 8);
        blks[nblk * 16 - 2] = str.length * 8;
        return blks;
    }

    static add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }

    static rol(num, cnt) {
        return (num << cnt) | (num >>> (32 - cnt));
    }

    static cmn(q, a, b, x, s, t) {
        return this.add(this.rol(this.add(this.add(a, q), this.add(x, t)), s), b);
    }

    static ff(a, b, c, d, x, s, t) {
        return this.cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }

    static gg(a, b, c, d, x, s, t) {
        return this.cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }

    static hh(a, b, c, d, x, s, t) {
        return this.cmn(b ^ c ^ d, a, b, x, s, t);
    }

    static ii(a, b, c, d, x, s, t) {
        return this.cmn(c ^ (b | (~d)), a, b, x, s, t);
    }

    static MD5(str) {
        let x = this.str2blks_MD5(str);
        var a = 1732584193;
        var b = -271733879;
        var c = -1732584194;
        var d = 271733878;
        for (let i = 0; i < x.length; i += 16) {
            var olda = a;
            var oldb = b;
            var oldc = c;
            var oldd = d;
            a = this.ff(a, b, c, d, x[i + 0], 7, -680876936);
            d = this.ff(d, a, b, c, x[i + 1], 12, -389564586);
            c = this.ff(c, d, a, b, x[i + 2], 17, 606105819);
            b = this.ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = this.ff(a, b, c, d, x[i + 4], 7, -176418897);
            d = this.ff(d, a, b, c, x[i + 5], 12, 1200080426);
            c = this.ff(c, d, a, b, x[i + 6], 17, -1473231341);
            b = this.ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = this.ff(a, b, c, d, x[i + 8], 7, 1770035416);
            d = this.ff(d, a, b, c, x[i + 9], 12, -1958414417);
            c = this.ff(c, d, a, b, x[i + 10], 17, -42063);
            b = this.ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = this.ff(a, b, c, d, x[i + 12], 7, 1804603682);
            d = this.ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = this.ff(c, d, a, b, x[i + 14], 17, -1502002290);
            b = this.ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = this.gg(a, b, c, d, x[i + 1], 5, -165796510);
            d = this.gg(d, a, b, c, x[i + 6], 9, -1069501632);
            c = this.gg(c, d, a, b, x[i + 11], 14, 643717713);
            b = this.gg(b, c, d, a, x[i + 0], 20, -373897302);
            a = this.gg(a, b, c, d, x[i + 5], 5, -701558691);
            d = this.gg(d, a, b, c, x[i + 10], 9, 38016083);
            c = this.gg(c, d, a, b, x[i + 15], 14, -660478335);
            b = this.gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = this.gg(a, b, c, d, x[i + 9], 5, 568446438);
            d = this.gg(d, a, b, c, x[i + 14], 9, -1019803690);
            c = this.gg(c, d, a, b, x[i + 3], 14, -187363961);
            b = this.gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = this.gg(a, b, c, d, x[i + 13], 5, -1444681467);
            d = this.gg(d, a, b, c, x[i + 2], 9, -51403784);
            c = this.gg(c, d, a, b, x[i + 7], 14, 1735328473);
            b = this.gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = this.hh(a, b, c, d, x[i + 5], 4, -378558);
            d = this.hh(d, a, b, c, x[i + 8], 11, -2022574463);
            c = this.hh(c, d, a, b, x[i + 11], 16, 1839030562);
            b = this.hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = this.hh(a, b, c, d, x[i + 1], 4, -1530992060);
            d = this.hh(d, a, b, c, x[i + 4], 11, 1272893353);
            c = this.hh(c, d, a, b, x[i + 7], 16, -155497632);
            b = this.hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = this.hh(a, b, c, d, x[i + 13], 4, 681279174);
            d = this.hh(d, a, b, c, x[i + 0], 11, -358537222);
            c = this.hh(c, d, a, b, x[i + 3], 16, -722521979);
            b = this.hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = this.hh(a, b, c, d, x[i + 9], 4, -640364487);
            d = this.hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = this.hh(c, d, a, b, x[i + 15], 16, 530742520);
            b = this.hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = this.ii(a, b, c, d, x[i + 0], 6, -198630844);
            d = this.ii(d, a, b, c, x[i + 7], 10, 1126891415);
            c = this.ii(c, d, a, b, x[i + 14], 15, -1416354905);
            b = this.ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = this.ii(a, b, c, d, x[i + 12], 6, 1700485571);
            d = this.ii(d, a, b, c, x[i + 3], 10, -1894986606);
            c = this.ii(c, d, a, b, x[i + 10], 15, -1051523);
            b = this.ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = this.ii(a, b, c, d, x[i + 8], 6, 1873313359);
            d = this.ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = this.ii(c, d, a, b, x[i + 6], 15, -1560198380);
            b = this.ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = this.ii(a, b, c, d, x[i + 4], 6, -145523070);
            d = this.ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = this.ii(c, d, a, b, x[i + 2], 15, 718787259);
            b = this.ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = this.add(a, olda);
            b = this.add(b, oldb);
            c = this.add(c, oldc);
            d = this.add(d, oldd);
        }
        return this.rhex(a) + this.rhex(b) + this.rhex(c) + this.rhex(d);
    }
}

Date.prototype.yyyymmdd = function () {
    var mm = this.getMonth() + 1; // getMonth() is zero-based
    var dd = this.getDate();

    return [this.getFullYear(),
        (mm > 9 ? '' : '0') + mm,
        (dd > 9 ? '' : '0') + dd
    ].join('');
};

Date.prototype.yyyymmddhhmmss = function () {
    var yyyy = this.getFullYear();
    var mm = this.getMonth() < 9 ? "0" + (this.getMonth() + 1) : (this.getMonth() + 1); // getMonth() is zero-based
    var dd = this.getDate() < 10 ? "0" + this.getDate() : this.getDate();
    var hh = this.getHours() < 10 ? "0" + this.getHours() : this.getHours();
    var min = this.getMinutes() < 10 ? "0" + this.getMinutes() : this.getMinutes();
    var ss = this.getSeconds() < 10 ? "0" + this.getSeconds() : this.getSeconds();
    return "".concat(yyyy).concat(mm).concat(dd).concat(hh).concat(min).concat(ss);
};

Date.prototype.yyyymmddhhmmssfff = function () {
    var yyyy = this.getFullYear();
    var mm = this.getMonth() < 9 ? "0" + (this.getMonth() + 1) : (this.getMonth() + 1); // getMonth() is zero-based
    var dd = this.getDate() < 10 ? "0" + this.getDate() : this.getDate();
    var hh = this.getHours() < 10 ? "0" + this.getHours() : this.getHours();
    var min = this.getMinutes() < 10 ? "0" + this.getMinutes() : this.getMinutes();
    var ss = this.getSeconds() < 10 ? "0" + this.getSeconds() : this.getSeconds();
    var fff = pad_digits(this.getMilliseconds(), 3);

    return "".concat(this.getFullYear())
        .concat(pad_digits(this.getMonth() + 1, 2))
        .concat(pad_digits(this.getDate(), 2))
        .concat(pad_digits(this.getHours(), 2))
        .concat(pad_digits(this.getMinutes(), 2))
        .concat(pad_digits(this.getSeconds(), 2))
        .concat(pad_digits(this.getMilliseconds(), 3));
};

function pad_digits(number, digits) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
}

function get_formatted_timestamp(date, format = 'yyyymmddhhmmssfff') {
    let reformatted_time = "";
    switch (format) {
        case "yyyymmdd":
            reformatted_time = date.yyyymmdd();
            break;
        case "yyyymmddhhmmss":
            reformatted_time = date.yyyymmddhhmmss();
            break;
        case "yyyymmddhhmmssfff":
            reformatted_time = date.yyyymmddhhmmssfff();
            break;
    }
    return reformatted_time;
}

function sleep(time, callback = undefined) {
    var stop = new Date().getTime();
    while (new Date().getTime() < stop + time) {;
    }
    if (callback !== undefined) {
        callback();
    }
}

function _util_convert_timestamp_to_date(timestamp) {
    return moment(timestamp, "YYYYMMDDHHmmssSSS").toDate();
}

function _util_get_human_readable_timestamp() {
    return moment().format("YYYYMMDDHHmmssSSS");
}

function get_hrt(date = new Date()) {
    let yyyy = date.getFullYear();
    let MM = date.getMonth();
    let dd = date.getDate();
    let hh = date.getHours();
    let mm = date.getMinutes();
    let ss = date.getSeconds();
    let fff = date.getMilliseconds();

    MM = MM < 9 ? `0${MM + 1}` : (MM + 1);
    dd = dd < 10 ? `0${dd}` : dd;
    hh = hh < 10 ? `0${hh}` : hh;
    mm = mm < 10 ? `0${mm}` : mm;
    ss = ss < 10 ? `0${ss}` : ss;
    fff = fff < 10 ? `00${fff}` : fff < 100 ? `0${fff}` : fff;

    return `${yyyy}${MM}${dd}${hh}${mm}${ss}${fff}`;
}

function get_human_readable_timestamp(timestamp) {
    // return (timestamp ? moment(timestamp) : moment()).utcOffset(8).format("YYYYMMDDHHmmssSSS");
    // return timestamp ? moment(timestamp).format('YYYYMMDDHHmmssSSS') : get_hrt();
    return timestamp ? get_hrt(new Date(timestamp)) : get_hrt();
}

async function _util_wait(milliseconds) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(1);
        }, milliseconds)
    })
}

function _util_transform_precision(number, precision_digits = 8) {
    return (Math.round(parseFloat(number) * Math.pow(10, precision_digits))) / Math.pow(10, precision_digits);
}

function _util_transform_minimum_tick_size(number, minimum_tick_size, precision_digits) {
    let result = Math.round(parseFloat(number) / minimum_tick_size) * minimum_tick_size;
    if (precision_digits) {
        return parseFloat(result.toFixed(precision_digits));
    }
    return result;
}

function _util_get_key_by_value(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}


function HMAC(algorithm, key, str) {
    if (!algorithm || !key || !str) {
        return Error("Missing parameters");
    }
    const hmac = crypto.createHmac(algorithm, key);
    hmac.update(str);
    return hmac.digest("hex");
}


module.exports = {
    MD5: MD5,
    HMAC: HMAC,
    get_formatted_timestamp: get_formatted_timestamp,
    sleep: sleep,
    _util_convert_timestamp_to_date: _util_convert_timestamp_to_date,
    _util_wait: _util_wait,
    _util_get_human_readable_timestamp: _util_get_human_readable_timestamp,
    get_human_readable_timestamp: get_human_readable_timestamp,
    _util_transform_precision: _util_transform_precision,
    _util_transform_minimum_tick_size: _util_transform_minimum_tick_size,
    _util_get_key_by_value: _util_get_key_by_value
}