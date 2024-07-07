require('../config/typedef');
require('../config/stratdef');
const https = require("https");
const querystring = require("querystring");
const moment = require('moment');
const momenttz = require('moment-timezone');
const request = require('request');
const JSONbig = require("json-bigint");

const logger = require('../module/logger');
const rp = require('../module/request');
const utils = require("../utils/util_func");

const JARVIS_API_URL = (process.env.ENVIRONMENT && process.env.ENVIRONMENT.startsWith('AWS_JP')) ?
    'http://172.31.3.250:3001/api/market/@data_type' : 'http://13.113.40.19:3001/api/market/@data_type';


// Date.prototype.yyyymmddhhmmssfff = function () {
//     return ''.concat(this.getFullYear())
//         .concat(pad_digits(this.getMonth() + 1, 2))
//         .concat(pad_digits(this.getDate(), 2))
//         .concat(pad_digits(this.getHours(), 2))
//         .concat(pad_digits(this.getMinutes(), 2))
//         .concat(pad_digits(this.getSeconds(), 2))
//         .concat(pad_digits(this.getMilliseconds(), 3));
// };

// Array.prototype.remove = function (from, to) {
//     let rest = this.slice((to || from) + 1 || this.length);
//     this.length = from < 0 ? this.length + from : from;
//     return this.push.apply(this, rest);
// };

// 生成rest请求
function _get_rest_options(url, params, key) {
    let presign = params && Object.keys(params).length > 0 ? querystring.stringify(params) : "";
    let signature = utils.HMAC("sha256", key.apiSecret, presign);

    return {
        url: url + "?",
        postbody: presign + (presign.length > 0 ? "&" : "") + "signature=" + signature,
        header: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-MBX-APIKEY": key.apiKey
        }
    }
}

async function set_leverage_by_rest(symbol, leverage, url, key) {
    let rest_params = _get_rest_options(url, {
        symbol: symbol,
        leverage: leverage,
        timestamp: Date.now()
    }, key);

    let o = {
        url: rest_params.url + rest_params.postbody,
        headers: rest_params.header,
        resolveWithFullResponse: true,   // get API_TYPE rate limit info
        agent: new https.Agent({
            keepAlive: true
        })
    };

    let response;
    try {
        response = await rp.post(o);
    } catch (e) {
        console.log(e.response.toJSON());
        return
    }

    let header = response['headers'];
    let body = response['body'];
    let jdata = (typeof body === "string") ? JSONbig.parse(body) : body;
    console.log(JSON.stringify(jdata));
}

function validateNumber(val) {
    return !(typeof val !== 'number' || isNaN(val) || val === Infinity || val === -Infinity);
}

function groupBy(xs, key) {
    return xs.reduce(function (rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
}

function pad_digits(number, digits) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
}

function setIntervalImmediately(callback, interval, runImmediately = true) {
    if (runImmediately) callback();
    return setInterval(callback, interval);
}

function quantile(arr, q) {
    arr = arr.sort((a, b) => a - b);
    const pos = ((arr.length) - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if ((arr[base + 1] !== undefined)) {
        return arr[base] + rest * (arr[base + 1] - arr[base]);
    }
    else {
        return arr[base];
    }
}

function EMA(arr, range) {
    let k = 2 / (range + 1);  // smooth factor
    let ema_arr = [arr[0]];

    for (let i = 1; i < arr.length; i++) {
        ema_arr.push(arr[i] * k + ema_arr[i - 1] * (1 - k));
    }
    return ema_arr;
}

function within_range(number, range, multiplier = 1.0) {
    return ((multiplier * range[0]) <= (+number)) && ((+number) <= (range[1] * multiplier));
}

function flat_array(array) {
    return [].concat(...array)
}

function deduplication(array) {
    return Array.from(new Set(array));
}

function sleep(ms) {
    // let stop = new Date().getTime();
    // while (new Date().getTime() < stop + time) {
    // }
    // if (callback !== undefined) {
    //     callback();
    // }
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function cal_bar_otime(ts, interval, splitAt = 8) {
    // This function is used to calculate the bar open time:
    // For example: 
    // 1d, splitAt 8: 20221102074627719 -> 20221101080000000
    // 1d, splitAt 8: 20221102154627719 -> 20221102080000000
    // 1m: 20221102154627719 -> 20221102150000000
    let bar_otime;
    if (interval === "1m") {
        bar_otime = ts.slice(0, 12) + "00000";
    } else if (interval.endsWith("m")) {
        let num = parseInt(interval.split("m")[0]);
        let min = parseInt(ts.slice(10, 12));
        let new_min = Math.floor(min / num) * num;
        let new_date_hour = ts.slice(0, 10);

        new_min = (new_min < 10)? `0${new_min}`: `${new_min}`;
        bar_otime = `${new_date_hour}${new_min}00000`;
    } else if (["2d", "1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval)) {
        //--- 完全可以统一成以下计算，但是时间的加减相比之下稍慢一点（仅慢5ms左右）
        // let num = (interval.endsWith("d")) ? parseInt(interval.split("d")[0]) * 24 : parseInt(interval.split("h")[0]);
        // let hour = moment(ts, format = "YYYYMMDDHHmmssSSS").diff(moment("20000101000000000", format = "YYYYMMDDHHmmssSSS"), 'hours');
        // let new_hour = (Math.floor((hour - splitAt) / num) * num + splitAt);
        // bar_otime = moment("20000101000000000", format = "YYYYMMDDHHmmssSSS", 'Asia/Shanghai').add(new_hour, 'h').format("YYYYMMDDHHmmssSSS");
        // return bar_otime;

        let num = (interval.endsWith("d")) ? parseInt(interval.split("d")[0]) * 24 : parseInt(interval.split("h")[0]);
        let hour = (interval == "2d") ? moment(ts, format = "YYYYMMDDHHmmssSSS").diff(moment("20000101000000000", format = "YYYYMMDDHHmmssSSS"), 'hours') : parseInt(ts.slice(8, 10));
        let new_hour = (Math.floor((hour - splitAt) / num) * num + splitAt);
        let new_date = ts.slice(0, 8);

        if (interval == "2d") {
            bar_otime = moment("20000101000000000", format = "YYYYMMDDHHmmssSSS", 'Asia/Shanghai').add(new_hour, 'h').format("YYYYMMDDHHmmssSSS");
            return bar_otime;
        }
    
        if (new_hour < 0) {
            new_hour = parseInt(new_hour + 24);
            new_date = moment(ts.slice(0, 10), 'YYYYMMDDHH', 'Asia/Shanghai').subtract(1, 'd').format("YYYYMMDDHHmmssSSS").slice(0, 8);
        }
    
        new_hour = (new_hour < 10)? `0${new_hour}`: `${new_hour}`;
        bar_otime = `${new_date}${new_hour}0000000`;
    }
    return bar_otime;
}

function recognize_timestamp(timestamp) {
    return momenttz.tz(timestamp, 'YYYYMMDDHHmmssSSS', 'Asia/Shanghai');
}

function convert_timestamp_to_date(timestamp) {
    return moment(timestamp, 'YYYYMMDDHHmmssSSS', 'Asia/Shanghai').toDate();
}

function hrt_to_ts(string) {
    let yyyy = string.slice(0, 4);
    let mm = string.slice(4, 6);
    let dd = string.slice(6, 8);
    let hh = string.slice(8, 10);
    let min = string.slice(10, 12);
    let ss = string.slice(12, 14);
    let fff = string.slice(14, 17);

    // 2020-10-10T14:48:00.000+08:00
    return Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}.${fff}+08:00`);
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

function round(number, precision = 4, type = 'round') {
    if (!validateNumber(+number)) {
        throw new Error(`Value must be a valid number, instead ${number}`)
    }
    if (!Number.isInteger(+precision) || precision < 0) {
        throw new Error(`Precision must be a non-negative integer, instead ${precision}`)
    }
    const multiplier = Math.pow(10, precision);
    switch (type) {
        case 'ceil':
            return Math.ceil(((+number) + Number.EPSILON) * multiplier) / multiplier;
        case 'floor':
            return Math.floor(((+number) + Number.EPSILON) * multiplier) / multiplier;
        case 'round':
        default:
            return Math.round(((+number) + Number.EPSILON) * multiplier) / multiplier;
    }
}

function range(length, start = 0) {
    return Array.from(Array(length), (x, i) => i + start)
}

function transform_with_tick_size(number, tick_size, round_type = 'jackie') {
    const point_level = Number.isInteger(+tick_size) ? 0 : tick_size.toString().split('.')[1].length;  // cover tick_size=0.25 case
    switch (round_type) {
        case 'round':
            return Math.max(parseFloat((Math.round(number / tick_size) * tick_size).toFixed(point_level)), tick_size);
        case 'floor':
            return parseFloat((Math.floor(number / tick_size) * tick_size).toFixed(point_level));
        case 'ceil':
            return parseFloat((Math.ceil(number / tick_size) * tick_size).toFixed(point_level));
        case 'jackie':
            return parseFloat((Math.round(number / tick_size) * tick_size).toFixed(point_level));
        default:
            return parseFloat((Math.round(number / tick_size) * tick_size).toFixed(point_level));
    }
}

function get_key_by_value(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function get_opposite_side(side) {
    switch (side) {
        case DIRECTION.BUY:
            return DIRECTION.SELL;
        case DIRECTION.SELL:
            return DIRECTION.BUY;
        default:
            logger.error(`${this.name}::get_opposite_side|${side} is invalid`);
    }
}

function stringify_order(order) {
    return `\n\
    | exchange=${order.exchange}\n\
    | symbol=${order.symbol}\n\
    | contract=${order.contract_type}\n\
    | strategy_key=${order.strategy_key}\n\
    | price=${order.price}\n\
    | size=${order.size}\n\
    | quantity=${order.quantity}\n\
    | direction=${order.direction}\n\
    | action=${order.action}\n\
    | type=${order.order_type}\n\
    | post_only=${order.post_only}\n\
    | delay=${order.delay}\n\
    | account_id=${order.account_id}`;
}

function direction_formatter(direction) {
    switch (direction.toString().toLowerCase()) {
        case 'buy':
        case 'cover':
        case 'bid':
        case '1':
        case '3':
            return DIRECTION.BUY;

        case 'sell':
        case 'short':
        case 'ask':
        case '2':
        case '4':
            return DIRECTION.SELL;

        default:
            logger.error(`${this.name}::direction_formatter|${direction} is invalid`);
    }
}

function calc_days_to_settle(exchange, contract_type) {
    let now = moment().utcOffset(8);
    let settle_date;

    switch (exchange) {
        case EXCHANGE.HUOBIFUTURE:
        case EXCHANGE.OKEXC:
        case EXCHANGE.OKEXU:
            settle_date = calc_future_delivery_date(contract_type, true, 16);
            break;
        case EXCHANGE.BINANCEC:
        case EXCHANGE.BINANCEU:
        case EXCHANGE.BYBITU:
        case EXCHANGE.BYBITC:
            settle_date = calc_future_delivery_date(contract_type, false, 16);
            break;
        case EXCHANGE.FTX:
        case EXCHANGE.DERIBIT:
        case EXCHANGE.KRAKENC:
            settle_date = calc_future_delivery_date(contract_type, false, 23);
            break;
        case EXCHANGE.BITMEX:
            settle_date = calc_future_delivery_date(contract_type, false, 20);
            break;
        case EXCHANGE.BITFLYER:
            settle_date = calc_future_delivery_date(contract_type, true, 9);
            break;
        default:
            logger.error(`calc_days_to_settle: ${exchange} not supported yet`);
            return;
    }
    return (settle_date - now) / (24 * 3600 * 1000);
}

function _cal_close_friday_before_according_current(date) {
    let cur_month_end_day = date.day();
    if (cur_month_end_day === 0) {
        return date.subtract(2, 'days');
    }
    else if (cur_month_end_day === 6) {
        return date.subtract(1, 'days')
    }
    else if (cur_month_end_day === 5) {
        return date
    }
    else {
        return date.subtract(2 + cur_month_end_day, 'days')
    }
}

function calc_future_delivery_date(contract_type = 'quarter', week_rolling = true, hour = 16, minuit = 0, second = 0, millisecond = 0, date = undefined) {
    let today = date ? moment(date).utcOffset(8) : moment().utcOffset(8);
    let target_date = '';
    if (contract_type.startsWith(CONTRACT_TYPE.THIS_QUARTER)) {
        let target_month_end_date = moment(today).endOf('quarter');
        let current_quarter_last_friday_date = _cal_close_friday_before_according_current(target_month_end_date);
        let current_quarter_delivery_time = current_quarter_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        if (week_rolling === true && today > current_quarter_delivery_time.clone().subtract(2, 'weeks')) {
            target_date = _cal_close_friday_before_according_current(current_quarter_delivery_time.add(3, 'weeks').endOf('quarter'))
        }
        else if (week_rolling === false && today > current_quarter_delivery_time) {
            target_date = _cal_close_friday_before_according_current(current_quarter_delivery_time.add(1, 'weeks').endOf('quarter'))
        }
        else {
            target_date = current_quarter_delivery_time;
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
    }
    else if (contract_type.startsWith(CONTRACT_TYPE.NEXT_QUARTER)) {
        let target_month_end_date = moment(today).endOf('quarter');
        let current_quarter_last_friday_date = _cal_close_friday_before_according_current(target_month_end_date);
        let quarter_month_delivery_time = current_quarter_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        if (week_rolling === true && today > quarter_month_delivery_time.clone().subtract(2, 'weeks')) {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(4, 'months').endOf('quarter'))
        }
        else if (week_rolling === false && today > quarter_month_delivery_time) {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(4, 'months').endOf('quarter'))
        }
        else {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(1, 'months').endOf('quarter'))
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
    }
    else if (contract_type.startsWith(CONTRACT_TYPE.NEXT_TWO_QUARTER)) {
        let target_month_end_date = moment(today).endOf('quarter');
        let current_quarter_last_friday_date = _cal_close_friday_before_according_current(target_month_end_date);
        let quarter_month_delivery_time = current_quarter_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        if (week_rolling === true && today > quarter_month_delivery_time.clone().subtract(2, 'weeks')) {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(7, 'months').endOf('quarter'))
        }
        else if (week_rolling === false && today > quarter_month_delivery_time) {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(7, 'months').endOf('quarter'))
        }
        else {
            target_date = _cal_close_friday_before_according_current(quarter_month_delivery_time.add(4, 'months').endOf('quarter'))
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
    }
    else if (contract_type.startsWith(CONTRACT_TYPE.THIS_MONTH)) {
        let target_month_end_date = moment(today).endOf('month');
        let current_month_last_friday_date = _cal_close_friday_before_according_current(target_month_end_date);
        let current_month_delivery_time = current_month_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        // TODO: month_rolling and week_rolling
        if (today > current_month_delivery_time) {
            target_date = _cal_close_friday_before_according_current(current_month_delivery_time.add(2, 'weeks').endOf('month'))
        }
        else {
            target_date = current_month_delivery_time;
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond)
    }
    else if (contract_type.startsWith(CONTRACT_TYPE.THIS_WEEK)) {
        let target_week_end_date = moment(today).endOf('week');
        let current_week_last_friday_date = _cal_close_friday_before_according_current(target_week_end_date);
        let current_week_delivery_time = current_week_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        if (today > current_week_delivery_time) {
            target_date = _cal_close_friday_before_according_current(current_week_delivery_time.add(3, 'days').endOf('week'))
        }
        else {
            target_date = current_week_delivery_time;
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond)
    }
    else if (contract_type.startsWith(CONTRACT_TYPE.NEXT_WEEK)) {
        let target_week_end_date = moment(today).endOf('week');
        let current_week_last_friday_date = _cal_close_friday_before_according_current(target_week_end_date);
        let current_week_delivery_time = current_week_last_friday_date.hour(hour).minute(minuit).second(second).millisecond(millisecond);
        if (today > current_week_delivery_time) {
            target_date = _cal_close_friday_before_according_current(current_week_delivery_time.add(10, 'days').endOf('week'))
        }
        else {
            target_date = _cal_close_friday_before_according_current(current_week_delivery_time.add(3, 'days').endOf('week'));
        }
        return target_date.hour(hour).minute(minuit).second(second).millisecond(millisecond)
    }
    else {
        throw new Error(`unrecognized contract type: ${contract_type}`)
    }
}

function merge_triangle_orderbook(idnt_x, idnt_y, ob_x, ob_y, px_btcusd) {
    ob_x = add_size_to_orderbook(idnt_x, ob_x, px_btcusd);
    ob_y = add_size_to_orderbook(idnt_y, ob_y, px_btcusd);

    const bids = [];
    const asks = [];
    const px_index = QUOTE_INDEX.PRICE;
    const size_index = QUOTE_INDEX.SIZE_IN_BTC;
    const sym_x = parse_symbol(idnt_x.split('.')[1]);
    const sym_y = parse_symbol(idnt_y.split('.')[1]);

    let merge_price = () => {};
    if (sym_x.base === sym_y.quote || sym_x.quote === sym_y.base) {   // x: XXXBTC y: BTCUSD
        merge_price = (px_x, px_y) => {
            return px_x * px_y;
        };
    }
    else if (sym_x.base === sym_y.base) {   // x: XXXBTC y: XXXUSD
        merge_price = (px_x, px_y) => {
            return px_y / px_x;
        };
    }
    else if (sym_x.quote === sym_y.quote) { // x: XXXUSD y: BTCUSD
        merge_price = (px_x, px_y) => {
            return px_x / px_y;
        };
    }
    else {
        merge_price = (px_x, px_y) => {
            return px_x / px_y;
        };
        // throw new Error(`merge_triangle_orderbook:: unsupported triangle idnt_x ${idnt_x} and idnt_y ${idnt_y}`);
    }

    let i = 0;
    let j = 0;
    let bid_x_cum_size = ob_x['bids'][i][size_index];
    let bid_y_cum_size = ob_y['bids'][j][size_index];
    bids.push([merge_price(ob_x['bids'][i][px_index], ob_y['bids'][j][px_index]),
               Math.min(ob_x['bids'][i][size_index], ob_y['bids'][j][size_index])]);

    while (i <= ob_x['bids'].length - 2 && j <= ob_y['bids'].length - 2) {
        let bid_price, bid_size;
        if (bid_x_cum_size === bid_y_cum_size) {
            i += 1;
            j += 1;
            bid_price = merge_price(ob_x['bids'][i][px_index], ob_y['bids'][j][px_index]);
            bid_size = Math.min(ob_x['bids'][i][size_index], ob_y['bids'][j][size_index]);
            bids.push([bid_price, bid_size]);
            bid_x_cum_size += ob_x['bids'][i][size_index];
            bid_y_cum_size += ob_y['bids'][j][size_index];
        }
        else if (bid_x_cum_size < bid_y_cum_size) {
            i += 1;
            bid_price = merge_price(ob_x['bids'][i][px_index], ob_y['bids'][j][px_index]);
            if (bid_x_cum_size + ob_x['bids'][i][size_index] <= bid_y_cum_size) {
                bid_size = ob_x['bids'][i][size_index];
            }
            else {
                bid_size = bid_y_cum_size - bid_x_cum_size;
            }
            bids.push([bid_price, bid_size]);
            bid_x_cum_size += ob_x['bids'][i][size_index];
        }
        else {
            j += 1;
            bid_price = merge_price(ob_x['bids'][i][px_index], ob_y['bids'][j][px_index]);
            if (bid_y_cum_size + ob_y['bids'][j][size_index] <= bid_x_cum_size) {
                bid_size = ob_y['bids'][j][size_index];
            }
            else {
                bid_size = bid_x_cum_size - bid_y_cum_size;
            }
            bids.push([bid_price, bid_size]);
            bid_y_cum_size += ob_y['bids'][j][size_index];
        }
    }

    i = 0;
    j = 0;
    let ask_x_cum_size = ob_x['asks'][i][size_index];
    let ask_y_cum_size = ob_y['asks'][j][size_index];
    asks.push([merge_price(ob_x['asks'][i][px_index], ob_y['asks'][j][px_index]),
        Math.min(ob_x['asks'][i][size_index], ob_y['asks'][j][size_index])]);

    while (i <= ob_x['asks'].length - 2 && j <= ob_y['asks'].length - 2) {
        let ask_price;
        let ask_size;
        if (ask_x_cum_size === ask_y_cum_size) {
            i += 1;
            j += 1;
            ask_price = merge_price(ob_x['asks'][i][px_index], ob_y['asks'][j][px_index]);
            ask_size = Math.min(ob_x['asks'][i][size_index], ob_y['asks'][j][size_index]);
            asks.push([ask_price, ask_size]);
            ask_x_cum_size += ob_x['asks'][i][size_index];
            ask_y_cum_size += ob_y['asks'][j][size_index];
        }
        else if (ask_x_cum_size < ask_y_cum_size) {
            i += 1;
            ask_price = merge_price(ob_x['asks'][i][px_index], ob_y['asks'][j][px_index]);
            if (ask_x_cum_size + ob_x['asks'][i][size_index] <= ask_y_cum_size) {
                ask_size = ob_x['asks'][i][size_index];
            }
            else {
                ask_size = ask_y_cum_size - ask_x_cum_size;
            }
            asks.push([ask_price, ask_size]);
            ask_x_cum_size += ob_x['asks'][i][size_index];
        }
        else {
            j += 1;
            ask_price = merge_price(ob_x['asks'][i][px_index], ob_y['asks'][j][px_index]);
            if (ask_y_cum_size + ob_y['asks'][j][size_index] <= ask_x_cum_size) {
                ask_size = ob_y['asks'][j][size_index];
            }
            else {
                ask_size = ask_x_cum_size - ask_y_cum_size;
            }
            asks.push([ask_price, ask_size]);
            ask_y_cum_size += ob_y['asks'][j][size_index];
        }
    }

    bids.forEach((bid, i) => bids[i][size_index] = bid[1]);
    asks.forEach((ask, j) => asks[j][size_index] = ask[1]);

    return {
        bids: bids,
        asks: asks
    }
}


function calc_long_short_amt_satisfy_spread(bid_ob, ask_ob, bid_size_index, ask_size_index, enter_exit_lvl, trading_cost) {
    let i = 0;
    let j = 0;
    let short_px = bid_ob[0][QUOTE_INDEX.PRICE];
    let long_px = ask_ob[0][QUOTE_INDEX.PRICE];

    function get_enter_exit_lvls(base_price) {
        return base_price * (1 + enter_exit_lvl + trading_cost);
    }

    let short_amt = (bid_ob[0][QUOTE_INDEX.PRICE] >= get_enter_exit_lvls(ask_ob[0][QUOTE_INDEX.PRICE])) ? bid_ob[0][bid_size_index] : 0.0;
    let long_amt = (bid_ob[0][QUOTE_INDEX.PRICE] >= get_enter_exit_lvls(ask_ob[0][QUOTE_INDEX.PRICE])) ? ask_ob[0][ask_size_index] : 0.0;
    while (bid_ob[i][QUOTE_INDEX.PRICE] >= get_enter_exit_lvls(ask_ob[j][QUOTE_INDEX.PRICE]) && i <= bid_ob.length - 2 && j <= ask_ob.length - 2) {
        short_px = bid_ob[i][QUOTE_INDEX.PRICE];
        long_px = ask_ob[j][QUOTE_INDEX.PRICE];
        if (short_amt > long_amt) {
            j += 1;
            if (bid_ob[i][QUOTE_INDEX.PRICE] >= get_enter_exit_lvls(ask_ob[j][QUOTE_INDEX.PRICE])) {
                long_amt += ask_ob[j][ask_size_index];
            }
        }
        else {
            i += 1;
            if (bid_ob[i][QUOTE_INDEX.PRICE] >= get_enter_exit_lvls(ask_ob[j][QUOTE_INDEX.PRICE])) {
                short_amt += bid_ob[i][bid_size_index];
            }
        }
    }

    return [short_px, long_px, short_amt, long_amt];
}

function calc_amt_satisfy_spread_with_maker_px(orderbook, maker_px, direction, size_index, enter_exit_lvl, trading_cost) {
    let ask_ob = orderbook['asks'];
    let bid_ob = orderbook['bids'];

    switch (direction) {
        case DIRECTION.BUY:
            let long_px = ask_ob[0][QUOTE_INDEX.PRICE];
            let long_amt = (long_px / maker_px - 1 <= enter_exit_lvl - trading_cost) ? ask_ob[0][size_index] : 0.0;

            let i = 1;
            while ((ask_ob[i][QUOTE_INDEX.PRICE] / maker_px - 1 <= enter_exit_lvl - trading_cost) && i <= ask_ob.length - 2) {
                long_px = ask_ob[i][QUOTE_INDEX.PRICE];
                long_amt += ask_ob[i][size_index];
                i += 1;
            }

            return [long_px, long_amt];

        case DIRECTION.SELL:
            let short_px = bid_ob[0][QUOTE_INDEX.PRICE];
            let short_amt = (short_px / maker_px - 1 >= enter_exit_lvl + trading_cost) ? bid_ob[0][size_index] : 0.0;

            let j = 1;
            while ((bid_ob[j][QUOTE_INDEX.PRICE] / maker_px - 1 >= enter_exit_lvl + trading_cost) && j <= bid_ob.length - 2) {
                short_px = bid_ob[j][QUOTE_INDEX.PRICE];
                short_amt += bid_ob[j][size_index];
                j += 1;
            }

            return [short_px, short_amt];

        default:
            logger.error(`calc_amt_satisfy_spread_with_given_px:: invalid direction: ${direction}`);
            return;
    }
}

function calc_market_limit_price(ob, side, distance, size_mode = false, size_factor = undefined, size = undefined, index = QUOTE_INDEX.SIZE) {
    if (size_mode) {
        let i = 0;
        let aggregate_size;
        switch (side.toLowerCase()) {
            case 'buy':
                aggregate_size = ob['asks'][i][index];
                while (aggregate_size < size / size_factor && i <= ob['asks'].length - 2) {
                    i = i + 1;
                    aggregate_size += ob['asks'][i][index];
                }
                return Math.max(ob['asks'][0][QUOTE_INDEX.PRICE] * (1 + distance), ob['asks'][i][QUOTE_INDEX.PRICE]);
            case 'sell':
                aggregate_size = ob['bids'][i][index];
                while (aggregate_size < size / size_factor && i <= ob['bids'].length - 2) {
                    i = i + 1;
                    aggregate_size += ob['bids'][i][index];
                }
                return Math.min(ob['bids'][0][QUOTE_INDEX.PRICE] * (1 - distance), ob['bids'][i][QUOTE_INDEX.PRICE]);
            default:
                logger.error(`${this.name}::calc_market_limit_price|side ${side} is invalid`);
        }
    }
    else {
        switch (side.toLowerCase()) {
            case 'buy':
                return ob['asks'][0][QUOTE_INDEX.PRICE] * (1 + distance);
            case 'sell':
                return ob['bids'][0][QUOTE_INDEX.PRICE] * (1 - distance);
            default:
                logger.error(`${this.name}::calc_market_limit_price|side ${side} is invalid`);
        }
    }
}


function get_yahoo_fx_rate(symbol) {
    // symbol format: CNY
    let http = require('https');
    let num = 6;
    let url = 'https://finance.yahoo.com/quote/USD' + symbol + '=x?ltr=1'; // format(symbol);
    return new Promise(async function (resolve, reject) {
        http.get(url, function (res) {
            let data = '';
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                //console.log(data);
                let target_to_find = symbol + '","regularMarketPrice":{"raw":';
                //let target_to_find = '"{}","regularMarketPrice":{}"raw":'.format(targetSymbol, '{');
                let a = data.indexOf(target_to_find);
                //console.log(a);
                let x = target_to_find.length;
                let result = data.slice(a + x, a + x + num);
                // console.log(result)
                resolve(result)
            })
        })
    });
}

function get_huobi_otc_quote(crypto) {
    // crypto format: USDT

    const coinIDs = {
        BTC: 1,
        USDT: 2,
        ETH: 3,
        HT: 4,
        EOS: 5,
        HUSD: 6,
        XRP: 7,
        LTC: 8
    };

    let http = require('https');
    let url = crypto.toUpperCase() === 'BCH'
        ? `https://otc-api-hk.eiijo.cn/v1/data/config/purchase-price?coinId=10&currencyId=1&matchType=0`
        : `https://otc-api-hk.eiijo.cn/v1/data/trade-market?coinId=${coinIDs[crypto.toUpperCase()]}&currency=1&tradeType=buy&currPage=1&payMethod=0&country=37&blockType=general&online=1&range=0`;
    return new Promise(async function (resolve, reject) {
        http.get(url, function (res) {
            let data = '';
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                // console.log(data);
                let response = JSON.parse(data);
                if (response['code'] !== 200 || response['data'].length === 0) {
                    console.error(`get_huobi_otc_quote::invalid response: ${response}`);
                    let err = new Error(`Unexpected status code: ${response.statusCode}, message: ${response.message}`);
                    reject(err);
                }
                else {
                    let quote = response['data'][0]['price'];
                    resolve(quote)
                }
            })
        })
    });
}

async function get_okex_otc_quote(crypto) {
    const pathUrl = 'https://aws.okex.com/v3/c2c/tradingOrders/books?baseCurrency=@ccy&quoteCurrency=cny';
    const url = pathUrl.replace('@ccy', crypto.toLowerCase());

    const resp = await rp.get({
        url: url
    });
    let body = JSON.parse(resp);

    if (body['code'] !== 0) {
        throw new Error(`${__callee}::error occur| ${body['error_message']}`);
    }

    let data = body['data'];
    // let ask1 = +(data['sell'].slice(-1)[0]['price']);
    // let ask1Size = +(data['sell'].slice(-1)[0]['availableAmount']);
    // let bid1 = +(data['buy'][0]['price']);
    // let bid1Size = +(data['buy'][0]['availableAmount']);

    return +(data['buy'][0]['price']);
}

function parse_symbol(symbol) {
    if (global.SymbolMap === undefined) {
        global.SymbolMap = {};
    }
    if (global.SymbolMap[symbol]) {
        // logger.debug(`parseSymbol:: from global ${symbol}`);
        return global.SymbolMap[symbol];
    }
    for (let ccy of ['USDT', 'USD', 'BTC', 'ETH']) {
        if (symbol.endsWith(ccy)) {
            let base_ccy = symbol.slice(0, symbol.lastIndexOf(ccy));
            if (Object.values(BASE_CURRENCY).includes(base_ccy)) {
                return global.SymbolMap[symbol] = {
                    base: base_ccy,
                    quote: ccy
                }
            }
        }
    }
    for (let ccy of Object.values(BASE_CURRENCY)) {
        if (symbol.startsWith(ccy)) {
            return global.SymbolMap[symbol] = {
                base: ccy,
                quote: symbol.replace(ccy, '')
            }
        }
    }
    for (let ccy of ['BUSD', 'HUSD', 'USDK', 'USDC', 'DAI', 'HT', 'OKB', 'BNB', 'FTT']) {
        if (symbol.endsWith(ccy)) {
            return global.SymbolMap[symbol] = {
                base: symbol.slice(0, symbol.lastIndexOf(ccy)),
                quote: ccy
            }
        }
    }
    for (let ccy of ['USDT', 'USD', 'BTC', 'ETH']) {
        if (symbol.endsWith(ccy)) {
            let base_ccy = symbol.slice(0, symbol.lastIndexOf(ccy));
            if (base_ccy.length === 2) {
                return global.SymbolMap[symbol] = {
                    base: base_ccy,
                    quote: ccy
                }
            }
        }
    }

    logger.error(`parseSymbol:: cannot parse symbol: ${symbol}`);

    return global.SymbolMap[symbol] = {
        base: symbol.slice(0, 3),
        quote: symbol.slice(3)
    }
}

function get_base_currency(symbol) {
    return parse_symbol(symbol)['base'];
}

function get_quote_currency(symbol) {
    return parse_symbol(symbol)['quote'];
}

function add_size_to_orderbook(idnt, ob, px_btcusd) {
    const bids = ob['bids'];
    const asks = ob['asks'];

    if (idnt in QUANTO) {
        for (let i = 0; i < bids.length; i++) {
            // ob['bids'][i][QUOTE_INDEX.SIZE_IN_COIN] = px_btcusd * bids[i][1] * QUANTO[idnt];
            ob['bids'][i][QUOTE_INDEX.SIZE_IN_BTC] = bids[i][0] * bids[i][1] * QUANTO[idnt];
        }
        for (let i = 0; i < asks.length; i++) {
            // ob['asks'][i][QUOTE_INDEX.SIZE_IN_COIN] = px_btcusd * asks[i][1] * QUANTO[idnt];
            ob['asks'][i][QUOTE_INDEX.SIZE_IN_BTC] = asks[i][0] * asks[i][1] * QUANTO[idnt];
        }
        return ob;
    }

    const [ex, sym, cont] = idnt.split('.');
    const {base, quote} = parse_symbol(sym);
    const multiplier = CONTRACT_MULTIPLIER[idnt] || 1;

    if (quote === 'BTC') {
        for (let i = 0; i < bids.length; i++) {
            // ob['bids'][i][QUOTE_INDEX.SIZE_IN_COIN] = bids[i][1];
            ob['bids'][i][QUOTE_INDEX.SIZE_IN_BTC] = bids[i][0] * bids[i][1] * multiplier;
        }
        for (let i = 0; i < asks.length; i++) {
            // ob['asks'][i][QUOTE_INDEX.SIZE_IN_COIN] = asks[i][1];
            ob['asks'][i][QUOTE_INDEX.SIZE_IN_BTC] = asks[i][0] * asks[i][1] * multiplier;
        }
        return ob;
    }

    const in_self_px = base === 'BTC' && quote.includes('USD');

    if (STABLE_COIN.includes(quote) || [CONTRACT_TYPE.SPOT].includes(cont) || [EXCHANGE.FTX].includes(ex)) {
        for (let i = 0; i < bids.length; i++) {
            px_btcusd = in_self_px ? bids[i][0] : px_btcusd;
            // ob['bids'][i][QUOTE_INDEX.SIZE_IN_COIN] = bids[i][1] * multiplier;
            ob['bids'][i][QUOTE_INDEX.SIZE_IN_BTC] = bids[i][0] * bids[i][1] * multiplier / px_btcusd;
        }
        for (let i = 0; i < asks.length; i++) {
            px_btcusd = in_self_px ? asks[i][0] : px_btcusd;
            // ob['asks'][i][QUOTE_INDEX.SIZE_IN_COIN] = asks[i][1] * multiplier;
            ob['asks'][i][QUOTE_INDEX.SIZE_IN_BTC] = asks[i][0] * asks[i][1] * multiplier / px_btcusd;
        }
        return ob;
    }

    if (quote === 'USD') {
        for (let i = 0; i < bids.length; i++) {
            px_btcusd = in_self_px ? bids[i][0] : px_btcusd;
            // ob['bids'][i][QUOTE_INDEX.SIZE_IN_COIN] = bids[i][1] * multiplier / bids[i][0];
            ob['bids'][i][QUOTE_INDEX.SIZE_IN_BTC] = bids[i][1] * multiplier / px_btcusd;
        }
        for (let i = 0; i < asks.length; i++) {
            px_btcusd = in_self_px ? asks[i][0] : px_btcusd;
            // ob['asks'][i][QUOTE_INDEX.SIZE_IN_COIN] = asks[i][1] * multiplier / asks[i][0];
            ob['asks'][i][QUOTE_INDEX.SIZE_IN_BTC] = asks[i][1] * multiplier / px_btcusd;
        }
        return ob;
    }

    throw new Error(`add_size_to_orderbook:: unsupported identifier: ${idnt}`);
}


// todo: TEST IT FULLY
function update_orderbook_with_bestquote(orderbook, bestquote) {
    if (orderbook.timestamp > bestquote.timestamp) {
        return orderbook;
    }

    let ob_asks = orderbook['asks'];
    let ob_bids = orderbook['bids'];
    let quote_ask = bestquote['ask'];
    let quote_bid = bestquote['bid'];

    if (ob_asks[0][0] > quote_ask[0]) {
        ob_asks.unshift(quote_ask);
    }
    else if (ob_asks[0][0] === quote_ask[0]) {
        ob_asks[0] = quote_ask;
    }
    else if (ob_asks[ob_asks.length - 1][0] < quote_ask[0]) {
        ob_asks = [quote_ask];
    }
    else {
        for (let i = 0, l = ob_asks.length; i < l; i++) {
            if (ob_asks[i] === undefined) {
                ob_asks = [quote_ask];
                break;
            }
            else if (ob_asks[i][0] === quote_ask[0]) {
                ob_asks[0] = quote_ask;
                break;
            }
            else if (ob_asks[i][0] > quote_ask[0]) {
                ob_asks.unshift(quote_ask);
                break;
            }
            else {
                ob_asks.shift();
                i -= 1;
            }
        }
    }

    if (ob_bids[0][0] < quote_bid[0]) {
        ob_bids.unshift(quote_bid);
    }
    else if (ob_bids[0][0] === quote_bid[0]) {
        ob_bids[0] = quote_bid;
    }
    else if (ob_bids[ob_bids.length - 1][0] > quote_bid[0]) {
        ob_bids = [quote_bid];
    }
    else {
        for (let i = 0, l = ob_bids.length; i < l; i++) {
            if (ob_bids[i] === undefined) {
                ob_bids = [quote_bid];
                break;
            }
            else if (ob_bids[i][0] === quote_bid[0]) {
                ob_bids[0] = quote_bid;
                break;
            }
            else if (ob_bids[i][0] < quote_bid[0]) {
                ob_bids.unshift(quote_bid);
                break;
            }
            else {
                ob_bids.shift();
                i -= 1;
            }
        }
    }

    return {
        asks: ob_asks,
        bids: ob_bids,
        update_type: 'bbo',
        timestamp: bestquote.timestamp
    }
}

function abbr_identifier(identifier) {
    if (global.IdentifierAbbrMap === undefined) {
        global.IdentifierAbbrMap = {};
    }

    if (global.IdentifierAbbrMap[identifier]) {
        return global.IdentifierAbbrMap[identifier];
    }
    let [ex, sym, cont] = identifier.split('.');
    let base_ccy = parse_symbol(sym).base;
    let quote_ccy = parse_symbol(sym).quote;
    let ccy = quote_ccy === 'BUSD' ? (base_ccy + 'B') : base_ccy;

    if (!(EX_ABBR[ex] && CONT_ABBR[cont])) {
        throw new Error(`${__callee}::invalid strategy_key ${identifier} for no abbr map for exchange or contract_type.`);
    }

    const abbr_idnt = [EX_ABBR[ex], ccy, CONT_ABBR[cont]].join('.');
    global.IdentifierAbbrMap[identifier] = abbr_idnt;

    if (global.IdentifierMap === undefined) {
        global.IdentifierMap = {};
    }
    global.IdentifierMap[abbr_idnt] = identifier;

    return abbr_idnt;
}

function parse_identifier_abbr(identifier_abbr) {
    if (global.IdentifierMap === undefined) {
        global.IdentifierMap = {};
    }
    if (global.IdentifierMap[identifier_abbr]) {
        return global.IdentifierMap[identifier_abbr];
    }
    else {
        logger.warn(`${__callee}:: ${identifier_abbr} [parse_identifier_abbr] called before [abbr_identifier] is not safe.`);
    }
    let [ex_abbr, base, cont_abbr] = identifier_abbr.split('.');
    let exchange = get_key_by_value(EX_ABBR, ex_abbr);
    let contract_type = get_key_by_value(CONT_ABBR, cont_abbr);
    let symbol;
    if (exchange.endsWith('U')) {
        if (base.endsWith('B') && BASE_CURRENCY[base] === undefined) {
            symbol = base + 'USD';
        }
        else {
            symbol = base + 'USDT';
        }
    }
    else {
        symbol = base + 'USD';
    }
    const identifier = [exchange, symbol, contract_type].join('.');
    global.IdentifierMap[identifier_abbr] = identifier;

    return identifier;
}

function abbr_strategy_key(strategy_key) {
    if (global.StrategyKeyAbbrMap === undefined) {
        global.StrategyKeyAbbrMap = {};
    }
    if (global.StrategyKeyAbbrMap[strategy_key]) {
        return global.StrategyKeyAbbrMap[strategy_key];
    }

    if (global.StrategyKeyMap === undefined) {
        global.StrategyKeyMap = {};
    }
    if (strategy_key in STRATEGY_KEY_ABBR) {
        global.StrategyKeyAbbrMap[strategy_key] = STRATEGY_KEY_ABBR[strategy_key];
        global.StrategyKeyMap[STRATEGY_KEY_ABBR[strategy_key]] = strategy_key;
        return STRATEGY_KEY_ABBR[strategy_key];
    }

    if (Object.values(STRATEGY_KEY_ABBR).includes(strategy_key)) {   // direct abbr: BNX|XX|BNB|XX|BNC
        const real_strategy_key = get_key_by_value(STRATEGY_KEY_ABBR, strategy_key);
        global.StrategyKeyAbbrMap[real_strategy_key] = strategy_key;
        global.StrategyKeyMap[strategy_key] = real_strategy_key;
        return strategy_key;
    }
    let sk_arr = strategy_key.split('|');
    if (sk_arr.length >= 3 && STRATEGY_KEY_ABBR[strategy_key] === undefined) {
        if (sk_arr.length === 5 && strategy_key.includes('|XX|')) {

        }
        else {
            logger.warn(`${__callee}:: please add strategy_key ${strategy_key} abbr map.`);
        }
        global.StrategyKeyAbbrMap[strategy_key] = strategy_key;
        global.StrategyKeyMap[strategy_key] = strategy_key;
        return strategy_key;
    }
    if ((strategy_key.startsWith('<-') && strategy_key.endsWith('->')) || strategy_key in BASE_CURRENCY) {
        global.StrategyKeyAbbrMap[strategy_key] = strategy_key;
        global.StrategyKeyMap[strategy_key] = strategy_key;
        return strategy_key;
    }

    let [identifier1, identifier2] = strategy_key.split('|');
    if (identifier2 === undefined) {
        throw new Error(`${__callee}::invalid strategy_key ${strategy_key} to abbreviate.`);
        // global.StrategyKeyAbbrMap[strategy_key] = strategy_key;
        // global.StrategyKeyMap[strategy_key] = strategy_key;
        // return strategy_key;
    }

    let [ex1, sym1, cont1] = identifier1.split('.');
    let [ex2, sym2, cont2] = identifier2.split('.');

    if (!(ex1 && sym1 && cont1 && ex2 && sym2 && cont2)) {
        throw new Error(`${__callee}::invalid strategy_key ${strategy_key} to abbreviate.`);
        // global.StrategyKeyAbbrMap[strategy_key] = strategy_key;
        // global.StrategyKeyMap[strategy_key] = strategy_key;
        // return strategy_key;
    }

    let base_ccy1 = parse_symbol(sym1).base;
    let base_ccy2 = parse_symbol(sym2).base;
    let quote_ccy1 = parse_symbol(sym1).quote;
    let quote_ccy2 = parse_symbol(sym2).quote;

    let ccy = base_ccy1;

    if (base_ccy1 !== base_ccy2) {
        throw new Error(`${__callee}::invalid strategy_key ${strategy_key} to abbreviate for different base currency ${base_ccy1} and ${base_ccy2}.`);
    }

    if (quote_ccy1 === 'BUSD') {
        ccy = 'B' + ccy;
    }
    else if (ex1 === EXCHANGE.FTX && quote_ccy1 === 'USDT') {
        ccy = 'T' + ccy;
    }
    if (quote_ccy2 === 'BUSD') {
        ccy = ccy + 'B';
    }
    else if (ex2 === EXCHANGE.FTX && quote_ccy2 === 'USDT') {
        ccy = ccy + 'T';
    }

    if (!(EX_ABBR[ex1] && EX_ABBR[ex2] && CONT_ABBR[cont1] && CONT_ABBR[cont2])) {
        throw new Error(`${__callee}::invalid strategy_key ${strategy_key} for no abbr map for exchange or contract_type.`);
    }

    const strategy_key_abbr = [EX_ABBR[ex1], CONT_ABBR[cont1], ccy, CONT_ABBR[cont2], EX_ABBR[ex2]].join('|');
    global.StrategyKeyAbbrMap[strategy_key] = strategy_key_abbr;
    global.StrategyKeyMap[strategy_key_abbr] = strategy_key;

    return strategy_key_abbr;
}

function parse_strategy_key_abbr(strategy_key_abbr) {
    if (global.StrategyKeyMap === undefined) {
        global.StrategyKeyMap = {};
    }
    if (global.StrategyKeyMap[strategy_key_abbr]) {
        return global.StrategyKeyMap[strategy_key_abbr];
    }
    else if (Object.values(STRATEGY_KEY_ABBR).includes(strategy_key_abbr)) {
        global.StrategyKeyMap[strategy_key_abbr] = get_key_by_value(STRATEGY_KEY_ABBR, strategy_key_abbr);
        return global.StrategyKeyMap[strategy_key_abbr];
    }
    else {
        logger.warn(`${__callee}:: ${strategy_key_abbr} [parse_strategy_key_abbr] called before [abbr_strategy_key] is not safe.`);
    }

    let [ex1_abbr, cont1_abbr, base, cont2_abbr, ex2_abbr] = strategy_key_abbr.split('|');
    if (!(ex1_abbr && cont1_abbr && base && cont2_abbr && ex2_abbr)) {
        global.StrategyKeyMap[strategy_key_abbr] = strategy_key_abbr;
        return strategy_key_abbr;
    }

    let exchange1 = get_key_by_value(EX_ABBR, ex1_abbr);
    let exchange2 = get_key_by_value(EX_ABBR, ex2_abbr);
    let contract_type1 = get_key_by_value(CONT_ABBR, cont1_abbr);
    let contract_type2 = get_key_by_value(CONT_ABBR, cont2_abbr);

    if (!(exchange1 && exchange2 && contract_type1 && contract_type2)) {
        logger.warn(`${__callee}| invalid strategy_key_abbr: ${strategy_key_abbr}`);
        global.StrategyKeyMap[strategy_key_abbr] = strategy_key_abbr;
        return strategy_key_abbr;
    }

    function conclude_symbol(exchange, ccy, contract_type) {
        if (contract_type === CONTRACT_TYPE.SPOT) {
            if (ccy.endsWith('B') && BASE_CURRENCY[ccy.slice(0, -1)] && !BASE_CURRENCY[ccy]) {
                return ccy + 'USD';
            }
            else if (ccy.endsWith('T') && BASE_CURRENCY[ccy.slice(0, -1)] && !BASE_CURRENCY[ccy]) {
                return ccy.slice(0, -1) + 'USDT';
            }
            else if (ccy.endsWith('C') && BASE_CURRENCY[ccy.slice(0, -1)] && !BASE_CURRENCY[ccy]) {
                return ccy.slice(0, -1) + 'USDC';
            }
            else if (exchange === EXCHANGE.FTX){
                return ccy + 'USD';
            }
            else if (exchange === EXCHANGE.BINANCE){
                return ccy + 'USDT';
            }
            // else {
            //     return ccy + 'USDT';
            // }
        }
        for (let quote of [`USDT`, `USD`, `BUSD`, 'KRW']) {
            if (PRICE_TICK_SIZE[`${exchange}.${ccy}${quote}.${contract_type}`]) {
                return `${ccy}${quote}`;
            }
        }
    }

    let symbol1 = conclude_symbol(exchange1, base, contract_type1);
    let symbol2 = conclude_symbol(exchange2, base, contract_type2);

    let identifier1 = [exchange1, symbol1, contract_type1].join('.');
    let identifier2 = [exchange2, symbol2, contract_type2].join('.');

    global.StrategyKeyMap[strategy_key_abbr] = [identifier1, identifier2].join('|');

    return global.StrategyKeyMap[strategy_key_abbr];
}

function reverse_strategy_key(strategy_key) {
    return strategy_key.split('|').reverse().join('|');
}

function reverse_strategy_key_abbr(strategy_key_abbr) {
    return abbr_strategy_key(reverse_strategy_key(parse_strategy_key_abbr(strategy_key_abbr)));
    // return strategy_key_abbr.split('|').reverse().join('|');
}

function abbr_reverse_strategy_key(strategy_key) {
    let reverse_strategy_key = reverse_strategy_key(strategy_key);
    return abbr_strategy_key(reverse_strategy_key)
}

function reverse_spread_pct(spread_pct, precision) {
    const in_string = typeof spread_pct === 'string' && spread_pct.includes('%');
    const spread_pct_in_num = in_string ? pct_to_number(spread_pct) : +spread_pct;
    const r_spread_pct = spread_pct_in_num ? -1.0 / (1.0 / spread_pct_in_num + 1.0) : 0;
    return in_string ? to_percent(r_spread_pct, precision) :
        (precision === undefined ? r_spread_pct : round(r_spread_pct, precision));
}

function to_percent(num, precision = 2) {
    return `${(num * 100).toFixed(precision)}%`
}

function to_percent2(num, precision = 2) {
    return `${(num * 100).toFixed(precision)}`
}

function to_permill(num, precision = 2) {
    return `${(num * 1000).toFixed(precision)}‰`
}

function pct_to_number(pct) {
    return pct.split('%')[0] / 100;
}

function get_spot_position(balance, ex_act, symbol, key = undefined) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol];   // USD
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol]) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function set_spot_position(balance, ex_act, symbol, key, value) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol]) {
        if (key === undefined) {
            balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol] = value;   // USD
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol]) {
            balance[ex_act][POSITION_INFO_TYPE.SPOT_POSITION][symbol][key] = value;
        }
    }
}

function get_future_position(balance, ex_act, symbol, contract_type, key = undefined) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol][`${symbol}_${contract_type}`]) {

        let pos_info = balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol][`${symbol}_${contract_type}`];
        if (key in pos_info) {
            return pos_info[key];
        }
        else if (key === undefined || key === 'total_position') {
            return (pos_info[`${POSITION_SIDE.LONG}_total`] || 0) - (pos_info[`${POSITION_SIDE.SHORT}_total`] || 0);
        }
        else if (key === 'net_position_in_coin') {
            return (pos_info[`${POSITION_SIDE.LONG}_total_in_coin`] || 0) - (pos_info[`${POSITION_SIDE.SHORT}_total_in_coin`] || 0);
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function set_future_position(balance, ex_act, symbol, contract_type, key, value) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol]) {
        if (balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol][`${symbol}_${contract_type}`] === undefined) {
            balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol][`${symbol}_${contract_type}`] = {};
        }
        balance[ex_act][POSITION_INFO_TYPE.FUTURE_POSITION][symbol][`${symbol}_${contract_type}`][key] = value;
    }
}

function get_option_position(balance, ex_act, instrument_id, contract_type, key = undefined) {
    let symbol = instrument_id.split('-')[0];
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION]
        && balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION][symbol]
        && balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION][symbol][`${instrument_id}_${contract_type}`]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION][symbol][`${instrument_id}_${contract_type}`];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION][symbol][`${instrument_id}_${contract_type}`]) {
            return balance[ex_act][POSITION_INFO_TYPE.OPTION_POSITION][symbol][`${instrument_id}_${contract_type}`][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function get_future_userinfo(balance, ex_act, key = undefined) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO]) {
            if (ex_act.startsWith(EXCHANGE.BITMEX) && key === 'BTC_rights' && balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO]['BTC_adjusted_rights']) {
                return balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO]['BTC_adjusted_rights'];
            }
            return balance[ex_act][POSITION_INFO_TYPE.FUTURE_USERINFO][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function get_unified_userinfo(balance, ex_act, key = undefined) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.UNIFIED_USERINFO]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.UNIFIED_USERINFO];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.UNIFIED_USERINFO]) {
            return balance[ex_act][POSITION_INFO_TYPE.UNIFIED_USERINFO][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function get_spot_userinfo(balance, ex_act, key = undefined) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_USERINFO]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_USERINFO];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.SPOT_USERINFO]) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_USERINFO][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function get_wallet_balance(balance, ex_act, ccy, key) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.WALLET_INFO]
        && balance[ex_act][POSITION_INFO_TYPE.WALLET_INFO][ccy]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.WALLET_INFO][ccy];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.WALLET_INFO][ccy]) {
            return balance[ex_act][POSITION_INFO_TYPE.WALLET_INFO][ccy][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function get_spot_balance(balance, ex_act, ccy, key) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy]) {
        if (key === undefined) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy];
        }
        else if (key in balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy]) {
            return balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy][key];
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

function set_spot_balance(balance, ex_act, ccy, key, value) {
    if (balance[ex_act]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE]
        && balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy]) {
        balance[ex_act][POSITION_INFO_TYPE.SPOT_BALANCE][ccy][key] = value;
    }
}

function calc_position_pnl(identifier, quantity, avg_entry_price, cur_price, cur_btc_price) {
    if (avg_entry_price === 0 || cur_price === 0) {
        return 0;
    }

    if (QUANTO[identifier]) {
        return (cur_price - avg_entry_price) * quantity * QUANTO[identifier];   // in BTC
        // TODO: here wo just care about pnl of spread arbitrage, quantity is value_in_usd
        // return quantity * (1 / avg_entry_price - 1 / cur_price) * cur_price / cur_btc_price;
    }

    let [ex, symbol, contract_type] = identifier.split('.');

    if (ex === EXCHANGE.FTX || contract_type === CONTRACT_TYPE.SPOT || contract_type === CONTRACT_TYPE.LTFX) {
        return quantity * (cur_price - avg_entry_price) / cur_btc_price;
    }

    if (symbol.endsWith('BTC')) {
        return quantity * CONTRACT_MULTIPLIER[identifier] * (cur_price - avg_entry_price);   // in BTC
    }

    if (symbol.endsWith('USDT')) {
        return quantity * CONTRACT_MULTIPLIER[identifier] * (cur_price - avg_entry_price) / cur_btc_price;   // in BTC
    }

    if (ex === EXCHANGE.BINANCEU && symbol.endsWith('BUSD')) {
        return quantity * CONTRACT_MULTIPLIER[identifier] * (cur_price - avg_entry_price) / cur_btc_price;   // in BTC
    }

    if (symbol === 'BTCUSD') {
        return quantity * CONTRACT_MULTIPLIER[identifier] * (1.0 / avg_entry_price - 1.0 / cur_price);
    }
    else {  // ETHUSD, XRPUSD, etc.
        return quantity * CONTRACT_MULTIPLIER[identifier] * (1.0 / avg_entry_price - 1.0 / cur_price) * cur_price / cur_btc_price;
    }
}

function convert_quantity_to_amount(identifier, quantity, idnt_price, btc_index, ccy_index) {
    if (quantity === 0) {
        return 0;
    }
    let [ex, symbol, cont] = identifier.split('.');

    if (QUANTO[identifier]) {
        // todo: check here
        return quantity * QUANTO[identifier] * idnt_price * btc_index / ccy_index;
        // return quantity * QUANTO[identifier] * btc_index;
    }
    if (symbol.endsWith('BTC')) {
        return quantity * CONTRACT_MULTIPLIER[identifier];   // including vanilla contract
    }
    if (cont === CONTRACT_TYPE.SPOT || ex === EXCHANGE.FTX) {
        return quantity;
    }
    if (symbol.endsWith('USDT')) {
        return quantity * CONTRACT_MULTIPLIER[identifier];
    }
    if (ex === EXCHANGE.BINANCEU && symbol.endsWith('BUSD')) {
        return quantity * (CONTRACT_MULTIPLIER[identifier] || 1);
    }
    return quantity * CONTRACT_MULTIPLIER[identifier] / idnt_price;
}

function convert_quantity_to_size(identifier, quantity, fut_price, btc_index) {
    if (quantity === 0) {
        return 0;
    }
    if (QUANTO[identifier]) {
        return fut_price * quantity * QUANTO[identifier];
    }

    let [ex, symbol, cont] = identifier.split('.');

    if (symbol.endsWith('BTC')) {
        return quantity * CONTRACT_MULTIPLIER[identifier] * fut_price;   // including vanilla contract
    }

    if (cont === CONTRACT_TYPE.SPOT || ex === EXCHANGE.FTX) {
        return symbol.startsWith('BTCUSD') ? quantity : (quantity * fut_price / btc_index);   // TODO: here just USD quoted
    }

    if (cont === CONTRACT_TYPE.LTFX) {
        if (symbol.endsWith('USD') === false) {
            return quantity * fut_price * get_yahoo_fx_rate('USD' + get_quote_currency(symbol)) / btc_index;
        }
        return quantity * fut_price / btc_index;   // USD quoted
    }

    if (symbol.endsWith('USDT')) {
        if (symbol === 'BTCUSDT') {
            return quantity * CONTRACT_MULTIPLIER[identifier];
        }
        return quantity * CONTRACT_MULTIPLIER[identifier] * fut_price / btc_index;
    }
    if (ex === EXCHANGE.BINANCEU && symbol.endsWith('BUSD')) {
        if (symbol === 'BTCBUSD') {
            return quantity * CONTRACT_MULTIPLIER[identifier];
        }
        return quantity * CONTRACT_MULTIPLIER[identifier] * fut_price / btc_index;
    }

    // quarter, week, month, perp
    if (symbol === 'BTCUSD') {
        return quantity * CONTRACT_MULTIPLIER[identifier] / fut_price;
    }
    return quantity * CONTRACT_MULTIPLIER[identifier] / btc_index;
}

function convert_size_to_quantity(identifier, size, idnt_price, btc_index, size_in_coin) {
    if (size === 0) {
        return 0;
    }
    if (QUANTO[identifier]) {
        // if (size_in_coin) {
        //     return size_in_coin / (btc_index * QUANTO[identifier]);  // it is preferred
        // }
        return size / (idnt_price * QUANTO[identifier]);
    }

    let [ex, symbol, cont] = identifier.split('.');

    if (symbol.endsWith('BTC')) {
        return size / (CONTRACT_MULTIPLIER[identifier] * idnt_price);   // including vanilla contract
    }

    if (cont === CONTRACT_TYPE.SPOT || ex === EXCHANGE.FTX) {
        return size_in_coin || (symbol.startsWith('BTCUSD') ? size : size * btc_index / idnt_price);   // TODO: here just USD quoted
    }

    if (cont === CONTRACT_TYPE.LTFX) {
        if (symbol.endsWith('USD') === false) {
            // cache yahoo fx rate localstorage
            return btc_index * size / (idnt_price * get_yahoo_fx_rate('USD' + get_quote_currency(symbol)));
        }
        return size_in_coin || (size * btc_index / idnt_price);   // USD quoted
    }

    if (symbol.endsWith('USDT')) {
        if (size_in_coin === undefined) {
            throw new Error(`${__callee}:: lacking size_in_coin for ${identifier} with size [${size}]`);
        }
        return size_in_coin / CONTRACT_MULTIPLIER[identifier];
    }
    if (ex === EXCHANGE.BINANCEU && symbol.endsWith('BUSD')) {
        if (size_in_coin === undefined) {
            throw new Error(`${__callee}:: lacking size_in_coin for ${identifier} with size [${size}]`);
        }
        return size_in_coin / CONTRACT_MULTIPLIER[identifier];
    }

    // quarter, week, month, perp
    if (symbol === 'BTCUSD') {
        return Math.round(idnt_price * size / CONTRACT_MULTIPLIER[identifier]);
    }
    return Math.round(idnt_price * size_in_coin / CONTRACT_MULTIPLIER[identifier]);
}

function convert_anchor_to_quanto_pos(anchor, quanto, anchor_pos, anchor_price, quanto_price, btc_price) {
    if (anchor_pos === 0) {
        return 0;
    }
    let anchor_pos_in_usd;

    let [ex, symbol, cont] = anchor.split('.');

    if (cont === CONTRACT_TYPE.SPOT || ex === EXCHANGE.FTX) {
        anchor_pos_in_usd = anchor_pos * anchor_price;
    }
    else if (symbol.endsWith('USDT')) {
        anchor_pos_in_usd = anchor_pos * CONTRACT_MULTIPLIER[anchor] * anchor_price;
    }
    else {
        anchor_pos_in_usd = anchor_pos * CONTRACT_MULTIPLIER[anchor]
    }

    return anchor_pos_in_usd / (QUANTO[quanto] * btc_price * quanto_price)
}

function _calc_trading_cost(pair, maker_index, account) {
    let fee = 0;
    pair.split('|').forEach((idnt, index) => {
        fee += (index === maker_index ? FEE[idnt][account][FEE_TYPE.MAKER] : FEE[idnt][account][FEE_TYPE.TAKER])
    });
    return fee;
}

function get_kline(exchange, symbol, cont, length, level = '1m') {
    switch (exchange) {
        case EXCHANGE.BITMEX:
        // TODO: FIX IT
        // return get_kline_from_bitmex(symbol, cont, length);

        case EXCHANGE.HUOBISWAP:
        case EXCHANGE.OKEXC:
        case EXCHANGE.OKEXU:
            return get_kline_from_huobiswap(symbol, cont, length, level);
        case EXCHANGE.HUOBISU:
            return get_kline_from_huobisu(symbol, cont, length, level);
        case EXCHANGE.BINANCEC:
            return get_kline_from_binancec(symbol, cont, length, level);
        case EXCHANGE.BINANCEU:
            return get_kline_from_binanceu(symbol, cont, length, level);
        case EXCHANGE.DERIBIT:
        case EXCHANGE.KRAKENC:
        case EXCHANGE.HUOBI:
        case EXCHANGE.HUOBIFUTURE:
        default:
            logger.error(`get_kline|error: get_kline for ${exchange} not implemented.`);
            return [];
    }
}

function get_kline_from_huobiswap(symbol, cont, length = 100, level = '1m') {
    let ex_symbol = symbol.replace('USD', '-USD');
    const url = `https://api.hbdm.com/swap-ex/market/history/kline?contract_code=${ex_symbol}&period=${level}in&size=${length}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            if (body['status'] === 'error' || body['data'] === undefined) {
                return reject(new Error(`error: ${body['err-msg']}`));
            }

            let kline = [];
            body['data'].map((data) => {
                kline.push({
                    open: data['open'],
                    high: data['high'],
                    low: data['low'],
                    close: data['close'],
                    volume: data['vol'],
                    timestamp: get_human_readable_timestamp(data['id'] * 1000)
                })
            });

            resolve(kline);
        });
    }));
}

function get_kline_from_huobisu(symbol, cont, length = 100, level = '1m') {
    let ex_symbol = symbol.replace('USD', '-USD');
    const url = `https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${ex_symbol}&period=${level}in&size=${length}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            if (body['status'] === 'error' || body['data'] === undefined) {
                return reject(new Error(`error: ${body['err-msg']}`));
            }

            let kline = [];
            body['data'].map((data) => {
                kline.push({
                    open: data['open'],
                    high: data['high'],
                    low: data['low'],
                    close: data['close'],
                    volume: data['vol'],
                    timestamp: get_human_readable_timestamp(data['id'] * 1000)
                })
            });

            resolve(kline);
        });
    }));
}

function get_kline_from_binancec(symbol, cont, length = 100, level = '1m') {
    let contractType;
    switch (cont) {
        case CONTRACT_TYPE.THIS_QUARTER:
            contractType = 'CURRENT_QUARTER';
            break;
        case CONTRACT_TYPE.NEXT_QUARTER:
            contractType = 'NEXT_QUARTER';
            break;
        case CONTRACT_TYPE.PERP:
        default:
            contractType = 'PERPETUAL';
    }

    const url = `https://dapi.binance.com/dapi/v1/continuousKlines?pair=${symbol}&contractType=${contractType}&interval=${level}&limit=${length}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            if (body['code'] && body['msg']) {
                return reject(new Error(`error: ${body['msg']}`));
            }

            let kline = [];
            body.map((data) => {
                kline.push({
                    open: +data[1],
                    high: +data[2],
                    low: +data[3],
                    close: +data[4],
                    volume: +data[7],
                    timestamp: get_human_readable_timestamp(data[0])
                })
            });

            resolve(kline);
        });
    }));
}

function get_kline_from_binanceu(symbol, cont, length = 100, level = '1m') {
    let contractType;
    switch (cont) {
        case CONTRACT_TYPE.THIS_QUARTER:
            contractType = 'CURRENT_QUARTER';
            break;
        case CONTRACT_TYPE.NEXT_QUARTER:
            contractType = 'NEXT_QUARTER';
            break;
        case CONTRACT_TYPE.PERP:
        default:
            contractType = 'PERPETUAL';
    }

    const url = `https://fapi.binance.com/fapi/v1/continuousKlines?pair=${symbol}&contractType=${contractType}&interval=${level}&limit=${length}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            if (body['code'] && body['msg']) {
                return reject(new Error(`error: ${body['msg']}`));
            }

            let kline = [];
            body.map((data) => {
                kline.push({
                    open: +data[1],
                    high: +data[2],
                    low: +data[3],
                    close: +data[4],
                    volume: +data[5],
                    timestamp: get_human_readable_timestamp(data[0])
                })
            });

            resolve(kline);
        });
    }));
}

async function get_open_interest(exchange, symbol, cont) {
    if (cont === CONTRACT_TYPE.SPOT) {
        return 0;
    }
    try {
        const qs = `?exchange=${exchange}&symbol=${symbol}&contract_type=${cont}&count=1&reverse=true`;
        const url = JARVIS_API_URL.replace('@data_type', MARKET_DATA.OPEN_INTEREST);
        const resp = await rp.get({url: url + qs});
        const body = typeof resp === 'string' ? JSON.parse(resp) : resp;

        if (body['success'] === false) {
            logger.error(`${__callee}| error: error occur: ${body['error_msg']}`);
            return 0;
        }
        else if (body['metadata'].length === 0) {
            logger.error(`${__callee}| there is no result for ${url + qs}`);
            return 0;
        }

        return body['metadata'][0]['open_interest'];
    }
    catch (e) {
        logger.error(`${__callee}|error: ${e.message}`);
    }
}

function get_open_interest_from_bitmex(symbol, cont) {
    const ex_symbol = get_exchange_symbol(EXCHANGE.BITMEX, symbol, cont);
    const url = `https://www.bitmex.com/api/v1/instrument?symbol=${ex_symbol}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            resolve(body[0]['openInterest']);
        });
    }));
}

async function get_open_interest_from_huobi(exchange, symbol, cont) {
    let url;
    symbol = get_base_currency(symbol);

    if (exchange === EXCHANGE.HUOBISU) {
        url = `https://api.hbdm.com/linear-swap-api/v1/swap_open_interest?contract_code=${symbol}-USDT`;
    }
    else if (exchange === EXCHANGE.HUOBISWAP) {
        url = `https://api.hbdm.com/swap-api/v1/swap_open_interest?contract_code=${symbol}-USD`;
    }
    else if (exchange === EXCHANGE.HUOBIFUTURE) {
        url = `https://api.hbdm.com/api/v1/contract_open_interest?symbol=${symbol}&contract_type=${cont}`;
    }
    else {
        throw new Error(`${__callee}:: invalid exchange: ${exchange}`);
    }

    let resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['status'] === 'error') {
        throw new Error(`${__callee}:: error occur: ${body['err_msg']}`);
    }
    return +body['data'][0]['volume'];
}

async function get_open_interest_from_binance(exchange, symbol, cont) {
    let url;
    symbol = get_exchange_symbol(exchange, symbol, cont);

    if (exchange === EXCHANGE.BINANCEC) {
        url = `https://dapi.binance.com/dapi/v1/openInterest?symbol=${symbol}`;
    }
    else if (exchange === EXCHANGE.BINANCEU) {
        url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`;
    }
    else {
        throw new Error(`${__callee}:: invalid exchange: ${exchange}`);
    }

    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['code']) {
        throw new Error(`${__callee}:: error occur: ${body['msg']}`);
    }

    return +body['openInterest'];
}

async function get_open_interest_from_okex(exchange, symbol, cont) {
    let instType = cont === CONTRACT_TYPE.PERP ? 'SWAP' : 'FUTURES';
    let instId = get_exchange_symbol(exchange, symbol, cont);

    let url = `https://www.okex.com/api/v5/public/open-interest?instType=${instType}&instId=${instId}`;
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (resp.hasOwnProperty('code') && +resp['code'] !== 0) {
        throw new Error(`${__callee}:: error occur: ${body['msg']}`);
    }

    return +body['data'][0]['oi'];
}

async function get_open_interest_from_bybit(exchange, symbol, cont) {
    symbol = get_exchange_symbol(exchange, symbol, cont);

    let url = `https://api.bybit.com/v2/public/tickers?symbol=${symbol}`;
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['ret_code'] !== 0) {
        throw new Error(`${__callee}:: error occur: ${body['ret_msg']}`);
    }

    return +body['result'][0]['open_interest'];
}

async function get_open_interest_from_ftx(symbol, cont) {
    symbol = get_exchange_symbol(EXCHANGE.FTX, symbol, cont);

    let url = `https://ftx.com/api/futures/${symbol}/stats`;
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['error']) {
        throw new Error(`${__callee}:: error occur: ${body['error']}`);
    }

    return +body['result']['openInterest'];
}

async function get_daily_volume(exchange, symbol, cont) {
    try {
        // // TODO: remove here
        // if (cont === CONTRACT_TYPE.SPOT) {
        //     return get_daily_volume_from_binance(exchange, symbol, cont);
        // }

        const qs = `?exchange=${exchange}&symbol=${symbol}&contract_type=${cont}&count=1&reverse=true`;
        const url = JARVIS_API_URL.replace('@data_type', MARKET_DATA.DAILY_VOLUME);
        const resp = await rp.get({url: url + qs});
        const body = typeof resp === 'string' ? JSON.parse(resp) : resp;

        if (body['success'] === false) {
            logger.error(`${__callee}| error: error occur: ${body['error_msg']}`);
            return 0;
        }
        else if (body['metadata'].length === 0) {
            logger.error(`${__callee}| there is no result for ${url + qs}`);
            return 0;
        }

        return body['metadata'][0]['volume'];
    }
    catch (e) {
        logger.error(`${__callee}|error: ${e.message}`);
    }
}

function get_daily_volume_from_bitmex(symbol, cont) {
    const ex_symbol = get_exchange_symbol(EXCHANGE.BITMEX, symbol, cont);
    const url = `https://www.bitmex.com/api/v1/instrument?symbol=${ex_symbol}`;

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) {
                return reject(error);
            }
            else if (response.statusCode !== 200) {
                let err = new Error('Unexpected status code: ' + response.statusCode);
                return reject(err);
            }

            resolve(body[0]['volume24h']);
        });
    }));
}

async function get_daily_volume_from_huobi(exchange, symbol, cont) {
    let url;
    symbol = get_exchange_symbol(exchange, symbol, cont);

    if (exchange === EXCHANGE.HUOBI) {
        url = `https://api.huobi.pro/market/detail/merged?symbol=${symbol}`;
    }
    else if (exchange === EXCHANGE.HUOBISU) {
        url = `https://api.hbdm.com/linear-swap-ex/market/detail/merged?contract_code=${symbol}`;
    }
    else if (exchange === EXCHANGE.HUOBISWAP) {
        url = `https://api.hbdm.com/swap-ex/market/detail/merged?contract_code=${symbol}`;
    }
    else if (exchange === EXCHANGE.HUOBIFUTURE) {
        url = `https://api.hbdm.com/market/detail/merged?symbol=${symbol}`;
    }
    else {
        throw new Error(`${__callee}:: invalid exchange: ${exchange}`);
    }

    let resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['status'] === 'error') {
        throw new Error(`${__callee}:: error occur: ${body['err_msg']}`);
    }
    return exchange === EXCHANGE.HUOBI ? +body['tick']['amount'] : +body['tick']['vol'] / 2;
}

async function get_daily_volume_from_binance(exchange, symbol, cont) {
    let url;
    symbol = get_exchange_symbol(exchange, symbol, cont);

    if (exchange === EXCHANGE.BINANCE) {
        url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    }
    else if (exchange === EXCHANGE.BINANCEC) {
        url = `https://dapi.binance.com/dapi/v1/ticker/24hr?symbol=${symbol}`;
    }
    else if (exchange === EXCHANGE.BINANCEU) {
        url = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`;
    }
    else {
        throw new Error(`${__callee}:: invalid exchange: ${exchange}`);
    }

    const resp = await rp.get({url: url});
    const raw_body = JSON.parse(resp);
    const body = Array.isArray(raw_body) ? raw_body[0] : raw_body;

    if (body['code']) {
        throw new Error(`${__callee}:: error occur: ${body['msg']}`);
    }

    return +body['volume'];
}

async function get_daily_volume_from_okex(exchange, symbol, cont) {
    let instId = get_exchange_symbol(exchange, symbol, cont);

    let url = `https://www.okex.com/api/v5/market/ticker?instId=${instId}`;
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (resp.hasOwnProperty('code') && +resp['code'] !== 0) {
        throw new Error(`${__callee}:: error occur: ${body['msg']}`);
    }

    return +body['data'][0]['vol24h'];
}

async function get_daily_volume_from_bybit(exchange, symbol, cont) {
    symbol = get_exchange_symbol(exchange, symbol, cont);

    let url;
    if (cont === CONTRACT_TYPE.SPOT) {
        url = `https://api.bybit.com/spot/quote/v1/ticker/24hr?symbol=${symbol}`;
    }
    else {
        url = `https://api.bybit.com/v2/public/tickers?symbol=${symbol}`;
    }
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['ret_code'] !== 0) {
        throw new Error(`${__callee}:: error occur: ${body['ret_msg']}`);
    }

    return Array.isArray(body['result']) ? +body['result'][0]['volume_24h'] : +body['result']['volume'];
}

async function get_daily_volume_from_ftx(symbol, cont) {
    symbol = get_exchange_symbol(EXCHANGE.FTX, symbol, cont);

    let url;
    if (cont === CONTRACT_TYPE.SPOT) {
        url = `https://ftx.com/api/markets/${symbol}`;
    }
    else {
        url = `https://ftx.com/api/futures/${symbol}/stats`;
    }
    const resp = await rp.get({url: url});
    const body = JSON.parse(resp);

    if (body['error']) {
        throw new Error(`${__callee}:: error occur: ${body['error']}`);
    }

    return cont === CONTRACT_TYPE.SPOT ? body['result']['quoteVolume24h'] / body['result']['last'] : +body['result']['volume'];
}


async function get_hist_spread(pair, start_time, end_time, interval = 15) {
    try {
        const qs = `?pair=${pair}&start_time=${start_time}&end_time=${end_time}&interval=${interval}`;
        const url = JARVIS_API_URL.replace('@data_type', MARKET_DATA.SPREAD);
        const resp = await rp.get({
            url: url + qs,
            timeout: 60000
        });
        const body = typeof resp === 'string' ? JSON.parse(resp) : resp;

        if (body['success'] === false) {
            logger.error(`${__callee}| error: error occur: ${body['error_msg']}`);
            return [];
        }
        else if (body['metadata'].length === 0) {
            logger.error(`${__callee}| there is no result for ${url + qs}`);
            return [];
        }
        // if (interval === 1) {
        //     return body['metadata'];
        // }
        // else {
        //     return body['metadata'].filter(i => i['timestamp'].slice(10, 12) % interval === 0)
        // }

        return body['metadata'];
    }
    catch (e) {
        logger.error(`${__callee}| error: ${e.message}`);
        return [];
    }
}

async function get_hist_price(identifier, start_time, end_time, interval = 15) {
    try {
        const [ex, sym, cont] = identifier.split('.');
        const qs = `?exchange=${ex}&symbol=${sym}&contract_type=${cont}&start_time=${start_time}&end_time=${end_time}&interval=${interval}`;
        const url = JARVIS_API_URL.replace('@data_type', MARKET_DATA.PRICE);
        const resp = await rp.get({
            url: url + qs,
            timeout: 60000
        });
        const body = typeof resp === 'string' ? JSON.parse(resp) : resp;

        if (body['success'] === false) {
            logger.error(`${__callee}| error: error occur: ${body['error_msg']}`);
            return [];
        }
        else if (body['metadata'].length === 0) {
            logger.error(`${__callee}| there is no result for ${url + qs}`);
            return [];
        }

        return body['metadata'];

        // if (interval === 1) {
        //     return body['metadata'];
        // }
        // else {
        //     return body['metadata'].filter(i => i['timestamp'].slice(10, 12) % interval === 0)
        // }
    }
    catch (e) {
        logger.error(`${__callee}| error: ${e.message}`);
        return [];
    }
}

async function get_hist_rates(identifier, start_time, end_time, reverse = false) {
    try {
        const [ex, sym, cont] = identifier.split('.');
        const qs = `?exchange=${ex}&symbol=${sym}&contract_type=${cont}&start_time=${start_time}&end_time=${end_time}&reverse=${reverse}`;
        const url = JARVIS_API_URL.replace('@data_type', MARKET_DATA.RATE);
        const resp = await rp.get({
            url: url + qs,
            timeout: 10 * 60000
        });
        const body = typeof resp === 'string' ? JSON.parse(resp) : resp;

        if (body['success'] === false) {
            logger.error(`${__callee}| error: error occur: ${body['error_msg']}`);
            return [];
        }
        else if (body['metadata'].length === 0) {
            logger.error(`${__callee}| there is no result for ${url + qs}`);
            return [];
        }

        let ts_rate_map = {};
        body['metadata'].forEach(i => {
            i['settle_ts'] = hrt_to_ts(i['settlement_time']);
            ts_rate_map[i['settlement_time']] = i;
        });

        return Object.values(ts_rate_map);
    }
    catch (e) {
        logger.error(`${__callee}| error: ${e.message}`);
        return [];
    }
}

async function get_price_series(symbol, period = 5) {
    function _parse_caught_exception(e) {
        // e.keys: name,statusCode,message,error,options,response
        if (e['response']) {
            let body = typeof e['response']['body'] === 'string' ? JSON.parse(e['response']['body']) : e['response']['body'];
            return Object.assign(body || {}, {
                stack: e.stack,
                message: e.message,
                statusCode: e.statusCode
            })
        }
        return e;
    }

    const ccy = get_base_currency(symbol);
    symbol = (symbol.endsWith('USDT') ? symbol : symbol + 'T');

    try {
        // 4032 5min bar = 14 day = 2 week
        const url1 = `https://fapi.binance.com/fapi/v1/indexPriceKlines?pair=${symbol}&interval=${period}m&limit=1344`;
        const resp1 = await rp.get({url: url1});
        const body1 = JSON.parse(resp1);
        const from_ts1 = body1[0][0];

        const url2 = `https://fapi.binance.com/fapi/v1/indexPriceKlines?pair=${symbol}&interval=${period}m&limit=1344&endTime=${from_ts1}`;
        const resp2 = await rp.get({url: url2});
        const body2 = JSON.parse(resp2);
        const from_ts2 = body2[0][0];

        const url3 = `https://fapi.binance.com/fapi/v1/indexPriceKlines?pair=${symbol}&interval=${period}m&limit=1344&endTime=${from_ts2}`;
        const resp3 = await rp.get({url: url3});
        const body3 = JSON.parse(resp3);

        const bars = body3.concat(body2).concat(body1);

        const latest_ts = bars[bars.length - 1][0];
        return {
            timestamp: latest_ts,
            interval: period * 60 * 1000,
            data: bars.map(x => round(+x[4], UI_PRICE_PRECISION[ccy]))
        }
    }
    catch (e) {
        e = _parse_caught_exception(e);
        logger.error(`${this.name}::${__callee}| error occur: ${e.msg || JSON.stringify(e.stack)}, code: ${e.code || e.statusCode}`);
    }
}


function kline_aggregator(kline, period = 30) {
    // [
    //     {
    //         open: 3966.4,
    //         high: 3966.4,
    //         low: 3966.4,
    //         close: 3966.4,
    //         volume: 0.1008,
    //         timestamp: 1555358175806,
    //     },
    //     {
    //         open: 3966.4,
    //         high: 3966.4,
    //         low: 3966.4,
    //         close: 3966.4,
    //         volume: 0.1008,
    //         timestamp: 1555358188888,
    //     }
    // ]
    // GroupedKline
    // {
    //     '1555358188888':
    //         [{
    //             open: 3977,
    //             high: 3977,
    //             low: 3977,
    //             close: 3977,
    //             volume: 3.7213,
    //             timestamp: 1555358188888,
    //         }]
    // };
    let start_time = moment(kline[0]['timestamp'], 'YYYYMMDDHHmmssSSS');
    let end_time = moment(kline[kline.length - 1]['timestamp'], 'YYYYMMDDHHmmssSSS');
    let grouped_kline = groupBy(kline, 'timestamp');

    let new_kline = [];

    for (let t = start_time; t.isBefore(end_time); t.add(period, 'minutes')) {

        let bar_time = t.clone();
        let time_str = get_human_readable_timestamp(bar_time);
        let bar = {
            open: grouped_kline[time_str][0]['open'],
            high: grouped_kline[time_str][0]['high'],
            low: grouped_kline[time_str][0]['low'],
            close: grouped_kline[time_str][0]['close'],
            volume: grouped_kline[time_str][0]['volume'],
            timestamp: get_human_readable_timestamp(+moment(bar_time))
        };

        let unit_t = bar_time.clone().add(1, 'minute');
        let next_t = t.clone().add(period, 'minutes');
        let unit_t_str = get_human_readable_timestamp(unit_t);

        while (unit_t < next_t) {
            if (unit_t_str in grouped_kline) {
                bar.high = Math.max(grouped_kline[unit_t_str][0]['high'], bar.high);
                bar.low = Math.min(grouped_kline[unit_t_str][0]['low'], bar.low);
                bar.volume += grouped_kline[unit_t_str][0]['volume'];
            }
            unit_t = unit_t.clone().add(1, 'minute');
            unit_t_str = get_human_readable_timestamp(unit_t);
        }
        if (!(unit_t_str in grouped_kline)) {
            continue;
        }
        bar.close = grouped_kline[unit_t_str][0]['close'];
        new_kline.push(bar);
    }
    return new_kline
}

function get_local_time(i) {
    if (typeof i !== 'number')
        return;

    let d = new Date();
    let len = d.getTime();
    let offset = d.getTimezoneOffset() * 60000;
    let utcTime = len + offset;

    return new Date(utcTime + i * 60000 * 60);
}

function toNonExponential(num) {
    let m = num.toExponential().match(/\d(?:\.(\d*))?e([+-]\d+)/);
    return num.toFixed(Math.max(0, (m[1] || '').length - m[2]));
}

function get_exchange_symbol(exchange, symbol, contract_type) {

    function _getBitMEXOriginalSymbol(symbol, contract_type) {
        // symbol
        const monthCodeMap = {3: 'H', 6: 'M', 9: 'U', 12: 'Z'};
        const _symbol = symbol.toUpperCase().replace('BTC', 'XBT');

        let settle_date;
        switch (contract_type) {
            case CONTRACT_TYPE.INDEX:
                let suffix = parse_symbol(symbol).base.replace('BTC', 'XBT');
                if (_symbol.endsWith('XBT')) {
                    suffix = _symbol;
                }
                else if (_symbol.endsWith('USDT')) {
                    suffix = suffix + 'T';
                }
                return '.B' + suffix;
            case CONTRACT_TYPE.PERP:
                return _symbol;
            case CONTRACT_TYPE.THIS_QUARTER:
                settle_date = moment().utc();
                settle_date.endOf('quarter').day(5).hour(12).minutes(0).seconds(0).milliseconds(0);
                if (settle_date.month() !== moment().utc().endOf('quarter').month()) {
                    settle_date.add(-7, 'days');
                }
                break;
            case CONTRACT_TYPE.NEXT_QUARTER:
                settle_date = moment().utc().add(3, 'months');
                settle_date.endOf('quarter').day(5).hour(12).minutes(0).seconds(0).milliseconds(0);
                if (settle_date.month() !== moment().utc().add(3, 'months').endOf('quarter').month()) {
                    settle_date.add(-7, 'days');
                }
                break;
            case CONTRACT_TYPE.NEXT_TWO_QUARTER:
                settle_date = moment().utc().add(6, 'months');
                settle_date.endOf('quarter').day(5).hour(12).minutes(0).seconds(0).milliseconds(0);
                if (settle_date.month() !== moment().utc().add(6, 'months').endOf('quarter').month()) {
                    settle_date.add(-7, 'days');
                }
                break;
            default:
                logger.error(`${__callee}::invalid bitmex contract_type: ${contract_type}`);
                return;
        }

        const settleMonth = settle_date.month() + 1;
        const settleYear = settle_date.year();
        const monthCode = monthCodeMap[settleMonth.toString()];
        const yearCode = settleYear.toString().slice(-2);
        const settleCode = `${monthCode}${yearCode}`;

        if (_symbol === 'XBTUSD') {
            return _symbol.replace('USD', settleCode);
        }
        else if (_symbol.endsWith('XBT')) {
            return _symbol.replace('XBT', settleCode);
        }
        else {
            // like ETHUSD/LINKUSDT quarter
            return _symbol + settleCode;
        }
    }

    function _getOKExOriginalSymbol(symbol, contract_type) {
        // instrument_id
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
            case CONTRACT_TYPE.INDEX:
                return Object.values(parse_symbol(symbol)).join('-');
            case CONTRACT_TYPE.PERP:
                return symbol.replace('USD', '-USD') + '-SWAP';
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
                return symbol.replace('USD', '-USD') + '-' + calc_future_delivery_date(contract_type, true, 16).format('YYMMDD');
            default:
                logger.error(`${__callee}::invalid okex contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getHuobiOriginalSymbol(symbol, contract_type) {
        // contract_code / symbol
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol.toLowerCase();
            case CONTRACT_TYPE.PERP:
                return symbol === 'USDTUSD' ? 'USDT-USD' : symbol.replace('USD', '-USD');
            case CONTRACT_TYPE.THIS_WEEK:
                return symbol.slice(0, symbol.indexOf('USD')) + '_CW';
            case CONTRACT_TYPE.NEXT_WEEK:
                return symbol.slice(0, symbol.indexOf('USD')) + '_NW';
            case CONTRACT_TYPE.THIS_QUARTER:
                return symbol.slice(0, symbol.indexOf('USD')) + '_CQ';
            case CONTRACT_TYPE.NEXT_QUARTER:
                return symbol.slice(0, symbol.indexOf('USD')) + '_NQ';
            default:
                logger.error(`${__callee}::invalid huobi contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getBinanceOriginalSymbol(symbol, contract_type) {
        // symbol
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol;
            case CONTRACT_TYPE.PERP:
                return symbol.endsWith('USDT') ? symbol : symbol + '_' + 'PERP';
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
                return symbol + '_' + calc_future_delivery_date(contract_type, false, 16).format('YYMMDD');
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            default:
                logger.error(`${__callee}::invalid binance contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getBybitOriginalSymbol(symbol, contract_type) {
        // symbol
        if (contract_type === CONTRACT_TYPE.SPOT) return symbol;
        return _getBitMEXOriginalSymbol(symbol, contract_type).replace('XBT', 'BTC');

        // switch (contract_type) {
        //     case CONTRACT_TYPE.PERP:
        //         return symbol;
        //     case CONTRACT_TYPE.THIS_QUARTER:
        //
        //     case CONTRACT_TYPE.NEXT_QUARTER:
        //         const settleMonth = settle_date.month() + 1;
        //         const settleYear = settle_date.year();
        //         const monthCode = monthCodeMap[settleMonth.toString()];
        //         const yearCode = settleYear.toString().slice(-2);
        //         const settleCode = `${monthCode}${yearCode}`;
        //     case CONTRACT_TYPE.THIS_WEEK:
        //     case CONTRACT_TYPE.NEXT_WEEK:
        //     default:
        //         logger.error(`${__callee}::invalid bybit contract_type: ${contract_type}`);
        //         return symbol;
        // }
    }

    function _getFtxOriginalSymbol(symbol, contract_type) {
        // market
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                let quote_ccy = ['USDT', 'BTC', 'USD', 'ETH', 'FTT', 'BNB', 'DAI', 'USDC'].find((coin) => symbol.endsWith(coin));
                if (quote_ccy) {
                    return symbol.replace(quote_ccy, `/${quote_ccy}`);
                }
                logger.error(`${__callee}::unrecognized ftx spot symbol: ${symbol}`);
                return symbol.slice(0, 3) + '/' + symbol.slice(3, symbol.length);
            case CONTRACT_TYPE.PERP:
                return (symbol.startsWith('USDT') ? 'USDT': symbol.slice(0, symbol.indexOf('USD'))) + '-PERP';
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
                let base_ccy = symbol.startsWith('USDT') ? 'USDT' : symbol.slice(0, symbol.indexOf('USD'));
                return base_ccy + '-' + calc_future_delivery_date(contract_type, false, 23).format('MMDD');
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            default:
                logger.error(`${__callee}::invalid ftx contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getDeribitOriginalSymbol(symbol, contract_type) {
        // instrument_name
        switch (contract_type) {
            case CONTRACT_TYPE.PERP:
                return symbol.slice(0, symbol.indexOf('USD')) + '-PERPETUAL';
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
            case CONTRACT_TYPE.NEXT_TWO_QUARTER:
                let settle_data = calc_future_delivery_date(contract_type, false, 23).format('DMMMYY').toUpperCase();
                return symbol.slice(0, symbol.indexOf('USD')) + '-' + settle_data;
            case CONTRACT_TYPE.INDEX:
                return symbol.slice(0, symbol.indexOf('USD'));
            case CONTRACT_TYPE.OPTION:
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            default:
                logger.error(`${__callee}::invalid deribit contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getKrakenCOriginalSymbol(symbol, contract_type) {
        // ticker symbol
        let settle_date;
        switch (contract_type) {
            case CONTRACT_TYPE.PERP:
                return ('PI_' + symbol.replace('BTC', 'XBT')).toLowerCase();
            case CONTRACT_TYPE.THIS_MONTH:
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
                settle_date = calc_future_delivery_date(contract_type, false, 23).format('YYMMDD');
                return ('FI_' + symbol.replace('BTC', 'XBT') + '_' + settle_date).toLowerCase();
            case CONTRACT_TYPE.INDEX:
                return ('IN_' + symbol.replace('BTC', 'XBT')).toLowerCase();
            default:
                logger.error(`${__callee}::invalid krakenc contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getBithumbOriginalSymbol(symbol, contract_type) {
        // baseCcy_quoteCcy
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol.slice(0, symbol.indexOf('KRW')) + '_' + 'KRW';
            case CONTRACT_TYPE.INDEX:
                return 'btci';
            default:
                logger.error(`${__callee}::invalid bithumb contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getCoinbaseOriginalSymbol(symbol, contract_type) {
        // product_id
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                if (symbol.endsWith('USDC')) {
                    return symbol.replace(symbol.slice(-4), '-' + symbol.slice(-4));
                }
                else { // WBTC-BTC
                    return symbol.replace(symbol.slice(-3), '-' + symbol.slice(-3));
                }
            case CONTRACT_TYPE.PERP:
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
            default:
                logger.error(`${__callee}::invalid coinbase contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getKrakenOriginalSymbol(symbol, contract_type) {
        // pair
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
            case 'spot_rest':
                return symbol.replace('BTC', 'XBT');
            case 'spot_ws':
                return symbol.replace('BTC', 'XBT').replace(symbol.slice(-3), '/' + symbol.slice(-3));
            case CONTRACT_TYPE.PERP:
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
            default:
                logger.error(`${__callee}::invalid kraken contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getBitfinexOriginalSymbol(symbol, contract_type) {
        // symbol
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return 't' + symbol.replace('DASH', 'DSH');
            case 'funding':
                return 'f' + symbol.length > 3 ? get_base_currency(symbol) : symbol;
            case CONTRACT_TYPE.PERP:
                return 't' + get_base_currency(symbol) + 'F0:USTF0';  // TODO: XAUTF0
            case CONTRACT_TYPE.THIS_WEEK:
            case CONTRACT_TYPE.NEXT_WEEK:
            case CONTRACT_TYPE.THIS_QUARTER:
            case CONTRACT_TYPE.NEXT_QUARTER:
            default:
                logger.error(`${__callee}::invalid bitfinex contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getBitsoOriginalSymbol(symbol, contract_type) {
        // book
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol.replace(symbol.slice(-3), '_' + symbol.slice(-3)).toLowerCase();
            default:
                logger.error(`${__callee}::invalid bitso contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getIndodaxOriginalSymbol(symbol, contract_type) {
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                symbol = symbol.replace('BCH', 'BCHABC').replace('BSV', 'BCHSV');
                return symbol.replace(symbol.slice(-3), '_' + symbol.slice(-3)).toLowerCase();
            default:
                logger.error(`${__callee}::invalid indodax contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getLunoOriginalSymbol(symbol, contract_type) {
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol.replace('BTC', 'XBT');
            default:
                logger.error(`${__callee}::invalid luno contract_type: ${contract_type}`);
                return symbol;
        }
    }

    function _getUpbitOriginalSymbol(symbol, contract_type) {
        switch (contract_type) {
            case CONTRACT_TYPE.SPOT:
                return symbol.includes('USDT') ? symbol.slice(-4) + '-' + symbol(0, -4) : symbol.slice(-3) + '-' + symbol(0, -3);
            default:
                logger.error(`${__callee}::invalid upbit contract_type: ${contract_type}`);
                return symbol;
        }
    }

    switch (exchange) {
        case EXCHANGE.BITMEX:
            return _getBitMEXOriginalSymbol(symbol, contract_type);
        case EXCHANGE.OKEX:
        case EXCHANGE.OKEXC:
        case EXCHANGE.OKEXU:
            return _getOKExOriginalSymbol(symbol, contract_type);
        case EXCHANGE.HUOBI:
        case EXCHANGE.HUOBISU:
        case EXCHANGE.HUOBISWAP:
        case EXCHANGE.HUOBIFUTURE:
            return _getHuobiOriginalSymbol(symbol, contract_type);
        case EXCHANGE.BINANCE:
        case EXCHANGE.BINANCEU:
        case EXCHANGE.BINANCEC:
            return _getBinanceOriginalSymbol(symbol, contract_type);
        case EXCHANGE.BYBITC:
        case EXCHANGE.BYBITU:
            return _getBybitOriginalSymbol(symbol, contract_type);
        case EXCHANGE.FTX:
            return _getFtxOriginalSymbol(symbol, contract_type);
        case EXCHANGE.DERIBIT:
            return _getDeribitOriginalSymbol(symbol, contract_type);
        case EXCHANGE.KRAKENC:
            return _getKrakenCOriginalSymbol(symbol, contract_type);
        case EXCHANGE.BITFINEX:
            return _getBitfinexOriginalSymbol(symbol, contract_type);
        case EXCHANGE.KRAKEN:
            return _getKrakenOriginalSymbol(symbol, contract_type);
        case EXCHANGE.COINBASE:
            return _getCoinbaseOriginalSymbol(symbol, contract_type);
        case EXCHANGE.BITHUMB:
            return _getBithumbOriginalSymbol(symbol, contract_type);
        case EXCHANGE.BITSO:
            return _getBitsoOriginalSymbol(symbol, contract_type);
        case EXCHANGE.LUNO:
            return _getLunoOriginalSymbol(symbol, contract_type);
        case EXCHANGE.INDODAX:
            return _getIndodaxOriginalSymbol(symbol, contract_type);
        case EXCHANGE.UPBIT:
            return _getUpbitOriginalSymbol(symbol, contract_type);
        default:
            logger.error(`${__callee}| error: ${__callee} for ${exchange} not implemented.`);
    }
}

async function get_contract_settlement_status(exchange) {
    let url;
    switch (exchange) {
        case EXCHANGE.HUOBISU:
            url = 'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info';
            break;
        case EXCHANGE.HUOBISWAP:
            url = 'https://api.hbdm.com/swap-api/v1/swap_contract_info';
            break;
        case EXCHANGE.HUOBIFUTURE:
            url = 'https://api.hbdm.com/api/v1/contract_contract_info';
            break;
        default:
            // throw new Error(`${__callee}|invalid exchange: ${exchange}`);
            return {all_settled: true};
    }

    return new Promise(((resolve, reject) => {
        request({
            url: url,
            json: true
        }, (error, response, body) => {
            if (error) return reject(error);
            if (response.statusCode !== 200) return reject(new Error('unexpected status code: ' + response.statusCode));
            if (body['status'] === 'error') return reject(new Error(`error: ${body['err-msg']}`));

            let trading_contract = {};
            body['data'].forEach((c) => {
                let symbol = c['symbol'] + (exchange === EXCHANGE.HUOBISU ? 'USDT' : 'USD');
                let contract_type = exchange === EXCHANGE.HUOBIFUTURE ? c['contract_type'] : CONTRACT_TYPE.PERP;
                trading_contract[[exchange, symbol, contract_type].join('.')] = (+c['contract_status'] === 1);
            });
            trading_contract['all_settled'] = body['data'].every(c => [5, 6, 7, 8].includes(+c['contract_status']) === false);

            resolve(trading_contract);
        });
    }));
}

function convert_to_standard_margin_ratio(exchange, ratio) {
    let std_ratio;
    switch (exchange) {
        case EXCHANGE.BITMEX:
        case EXCHANGE.BINANCEU:
        case EXCHANGE.BINANCEC:
        case EXCHANGE.FTX:
            std_ratio = ratio;
            break;
        case EXCHANGE.BINANCE:
        case EXCHANGE.HUOBI:
        case EXCHANGE.OKEX:
            std_ratio = Math.min(ratio, 100);
            break;
        case EXCHANGE.HUOBISU:
        case EXCHANGE.HUOBISWAP:
        case EXCHANGE.HUOBIFUTURE:
            std_ratio = Math.min(3 / 4 / (ratio + 0.5), 1);
            // return Math.exp(-ratio);
            break;
        case EXCHANGE.OKEXU:
        case EXCHANGE.OKEXC:
            std_ratio = 1 / ratio;
            break;
        default:
            logger.error(`${this.name}::${__callee}| unsupported exchange ${exchange}`);
            std_ratio = ratio;
            break;
    }
    return std_ratio;
    // if (std_ratio > 0.4) {
    //     return Math.ceil(std_ratio * 100 / 3) * 3 / 100;
    // }
    // else if (std_ratio > 0.2) {
    //     return Math.round(std_ratio * 100 / 5) * 5 / 100;
    // }
    // else {
    //     return Math.floor(std_ratio * 100 / 10) * 10 / 100;
    // }
}


module.exports = {
    set_leverage_by_rest: set_leverage_by_rest,
    sleep: sleep,
    quantile: quantile,
    setInterval: setIntervalImmediately,
    EMA: EMA,
    round: round,
    range: range,
    within_range: within_range,
    flat_array: flat_array,
    deduplication: deduplication,
    hrt_to_ts: hrt_to_ts,
    cal_bar_otime: cal_bar_otime,
    recognize_timestamp: recognize_timestamp,
    convert_timestamp_to_date: convert_timestamp_to_date,
    transform_with_tick_size: transform_with_tick_size,
    get_key_by_value: get_key_by_value,
    get_opposite_side: get_opposite_side,
    stringify_order: stringify_order,
    direction_formatter: direction_formatter,
    calc_market_limit_price: calc_market_limit_price,
    calc_days_to_settle: calc_days_to_settle,
    calc_trading_cost: _calc_trading_cost,
    merge_triangle_orderbook: merge_triangle_orderbook,
    calc_long_short_amt_satisfy_spread: calc_long_short_amt_satisfy_spread,
    calc_amt_satisfy_spread_with_maker_px: calc_amt_satisfy_spread_with_maker_px,
    get_yahoo_fx_rate: get_yahoo_fx_rate,
    get_huobi_otc_quote: get_huobi_otc_quote,
    get_okex_otc_quote: get_okex_otc_quote,
    parse_symbol: parse_symbol,
    get_base_currency: get_base_currency,
    get_quote_currency: get_quote_currency,
    to_percent: to_percent,
    to_percent2: to_percent2,
    to_permill: to_permill,
    pct_to_number: pct_to_number,
    abbr_identifier: abbr_identifier,
    abbr_strategy_key: abbr_strategy_key,
    parse_identifier_abbr: parse_identifier_abbr,
    parse_strategy_key_abbr: parse_strategy_key_abbr,
    reverse_strategy_key: reverse_strategy_key,
    reverse_strategy_key_abbr: reverse_strategy_key_abbr,
    abbr_reverse_strategy_key: abbr_reverse_strategy_key,
    reverse_spread_pct: reverse_spread_pct,
    calc_position_pnl: calc_position_pnl,
    add_size_to_orderbook: add_size_to_orderbook,
    update_orderbook_with_bestquote: update_orderbook_with_bestquote,
    get_wallet_balance: get_wallet_balance,
    get_spot_balance: get_spot_balance,
    set_spot_balance: set_spot_balance,
    get_spot_userinfo: get_spot_userinfo,
    get_spot_position: get_spot_position,
    set_spot_position: set_spot_position,
    get_future_userinfo: get_future_userinfo,
    get_unified_userinfo: get_unified_userinfo,
    get_future_position: get_future_position,
    set_future_position: set_future_position,
    get_option_position: get_option_position,
    convert_quantity_to_amount: convert_quantity_to_amount,
    convert_quantity_to_size: convert_quantity_to_size,
    convert_size_to_quantity: convert_size_to_quantity,
    convert_anchor_to_quanto_pos: convert_anchor_to_quanto_pos,
    get_kline: get_kline,
    kline_aggregator: kline_aggregator,
    get_local_time: get_local_time,
    toNonExponential: toNonExponential,
    get_contract_settlement_status: get_contract_settlement_status,
    get_open_interest: get_open_interest,
    get_daily_volume: get_daily_volume,
    get_price_series: get_price_series,
    get_hist_spread: get_hist_spread,
    get_hist_price: get_hist_price,
    get_hist_rates: get_hist_rates,
    convert_to_standard_margin_ratio: convert_to_standard_margin_ratio
};