const winston = require("winston");
require("winston-daily-rotate-file");

const callsite = require('callsite')
    , tty = require('tty')
    , isatty = Boolean(tty.isatty() && process.stdout.getWindowSize)
    , defaultColors = {sql: '90', error: '91', warn: '93', info: '96', http: '90'};

function console_timestamp(date = new Date()) {
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

    return `${MM}-${dd} ${hh}:${mm}:${ss}.${fff}`;
}

function log_timestamp(date = new Date()) {
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

    return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${fff}`;
}

const log_dir = 'log/';
const logLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6
    },
    colors: {
        error: "red",
        warn: "darkred",
        info: "black",
        http: "green",
        verbose: "blue",
        debug: "gray",
        silly: "gray"
    }
};

logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            level: process.env.PRODUCTION !== 'true' ? 'debug' : 'info',
            colorize: true,
            prettyPrint: true,
            timestamp: console_timestamp
        }),
        new (winston.transports.DailyRotateFile)({
            filename: log_dir + 'info-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '1g',          // kb, mb, gb (bit). 'k', 'm', 'g' (byte)
            maxFiles: '10d',        // this can be a number of files or number of days. If using days, add 'd' as the suffix
            level: "debug",
            name: "debug-file",
            timestamp: log_timestamp
        }),
        new (winston.transports.DailyRotateFile)({
            filename: log_dir + 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: false,
            maxSize: '1g',
            maxFiles: '5d',
            level: "error",
            name: "error-file",
            timestamp: log_timestamp
        })
    ]
});

winston.addColors(logLevels);

logger.traceOptions = Object.create(null);
logger.traceOptions.cwd = process.cwd() + '/';
logger.traceOptions.colors = true;

['error'].forEach(function (name) {
    let fn = logger[name];
    logger[name] = function () {
        if (Buffer.isBuffer(arguments[0])) {
            arguments[0] = arguments[0].inspect()
        }
        else if (typeof arguments[0] === 'object') {
            arguments[0] = JSON.stringify(arguments[0], null, '  ');
        }
        let pad = (arguments[0] || !isatty ? ' ' : '');
        arguments[0] = logger.traceFormat(callsite()[1], name) + pad + arguments[0];
        logger._trace = false;
        return fn.apply(this, arguments);
    }
});


logger.traceFormat = function (call, method) {
    let basename = call.getFileName().replace(logger.traceOptions.cwd, '')
        , str = '[' + basename + ':' + call.getLineNumber() + ']'
        , color = '99';

    if (logger.traceOptions.colors !== false) {
        if (logger.traceOptions.colors === undefined || logger.traceOptions.colors[method] === undefined) {
            color = defaultColors[method];
        }
        else {
            color = logger.traceOptions.colors[method];
        }
    }

    if (logger.traceOptions.right) {
        let rowWidth = process.stdout.getWindowSize()[0];
        return '\033[s' + // save current position
            '\033[' + rowWidth + 'D' + // move to the start of the line
            '\033[' + (rowWidth - str.length) + 'C' + // align right
            '\033[' + color + 'm' + str + '\033[39m' +
            '\033[u'; // restore current position
    }
    else {
        return '\033[' + color + 'm' + str + '\033[39m';
    }
};

module.exports = logger;