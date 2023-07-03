const rpn = require("request-promise-native");


function request(options, cb) {
    options.timeout = options.timeout || 30000;
    return rpn(options, cb);
}


request.post = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.post(options, cb);
};

request.get = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.get(options, cb);
};

request.head = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.head(options, cb);
};

request.put = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.put(options, cb);
};

request.patch = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.patch(options, cb);
};

request.del = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.del(options, cb);
};

request.delete = (options, cb) => {
    options.timeout = options.timeout || 30000;
    return rpn.delete(options, cb);
};


module.exports = request;