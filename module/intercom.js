const NRP = require('./redis_pubsub');
const logger = require('./logger');
const EventEmitter = require('events').EventEmitter;
require('../config/typedef');

global.EventHandler = new EventEmitter();

class Intercom {
    /**
     * init communication,input an array redis config or one JSON type config
     * you can input null also,when input nothing,it use EventEmitter to work
     * @param {(Object | Array | null)} intercom_config
     */
    constructor(intercom_config) {
        this.carriers = new Map();
        // console.log(global);
        this.carriers.set(INTERCOM_TYPE.EVENT_EMITTER, global.EventHandler);

        this.verbose = false;
        //init redis pubsub
        if (intercom_config) {
            if (!(intercom_config instanceof Array)) {
                intercom_config = [intercom_config];
            }

            if (this.verbose) {
                logger.debug('init redis by array config.');
            }
            if (intercom_config.length < 1) {
                logger.error('Intercom: check the config, it is empty!');
                throw new Error('Intercom: check the config, it is empty!');
            }
            for (let config of intercom_config) {
                this.carriers.set(config.scope, new NRP(config));
                this.carriers.get(config.scope).on('error', (e) => {
                    //logger.info(this.carriers.size);
                    //for (let scope of this.carriers) {
                    //    logger.info(scope, this.carriers.get(scope));
                    //}
                    logger.error(`Error occurred in intercom redis: ${e}`);
                });
            }
        }
        this.client_sub_channel = {}; // store channel of client subscribe
    }

    /**
     * publish data on channel;
     * when scope is null,use default EventEmitter
     * @param {string} channel
     * @param {Object} data
     * @param {string} [scope='EventEmitter'] default EventEmitter
     */
    emit(channel, data, scope = INTERCOM_TYPE.EVENT_EMITTER) {
        if (this.validate_scope(scope)) {
            this.carriers.get(scope).emit(channel, data);
        }
        else {
            logger.error(`Intercom::emit: scope ${scope} is invalid!`);
        }
    }

    /**
     ** check carriers exists scope or not
     * @param {string} scope
     * @returns {boolean}
     */
    validate_scope(scope) {
        if (!this.carriers.has(scope)) {
            logger.error('Intercom: carrier[' + scope + '] does not init');
            return false;
        }
        return true;
    }

    /**
     * bind listener on channel,
     * when scope is null,use default EventEmitter
     * if you want to bind context 'this',you should bind it in constructor,
     * such as [this.func = this.func.bind(this)]. 'this' should ont be bound in 'on' or 'remove' function
     * @param {string} channel
     * @param {(Function | Function[])} listener
     * @param {string} [scope = EventEmitter] default EventEmitter
     */
    on(channel, listener, scope = INTERCOM_TYPE.EVENT_EMITTER) {
        // logger.debug('Intercom received message:', channel, listener, scope);
        if (this.validate_scope(scope)) {
            if (scope === INTERCOM_TYPE.EVENT_EMITTER) { // use event way
                if (!(listener instanceof Function)) {
                    logger.error(`InterCom:on:listener expected Function but received ${typeof listener} `);
                    return;
                }
                this.carriers.get(scope).on(channel, listener);

                this._register_handler(channel, listener, scope);
            }
            else { // use redis pubsub
                let firstOnChannel = false;
                if (this.client_sub_channel[channel + scope] === undefined) {
                    firstOnChannel = true;
                }
                this._register_handler(channel, listener, scope);

                if (firstOnChannel === true) {
                    // register callback, when the channel event happen, call it
                    this.carriers.get(scope).on(channel, (data) => {
                        if (this.client_sub_channel) {
                            let handlers = this.client_sub_channel[channel + scope];
                            for (let func of handlers) {
                                func(data);
                            }
                        }
                    });
                }
            }
            if (this.verbose) {
                logger.debug(`Intercom::on: scope=${scope}, channel=${channel}, listener=${listener}`);
            }
        }
        else {
            logger.error(`Intercom::on: scope ${scope} is invalid!`);
        }
    };

    /**
     * remove listener on channel,
     * the listener which is removed no longer be called
     * when scope is null,use default EventEmitter
     * @param {string} channel
     * @param {(Function | Function[])} listener
     * @param {string} [scope=EventEmitter] default EventEmitter
     */

    removeListener(channel, listener, scope = INTERCOM_TYPE.EVENT_EMITTER) {
        if (!this.client_sub_channel[channel + scope]) {
            logger.error('InterCom:removeListener:listener dose not listen.');
            return;
        }

        if (listener instanceof Array) {
            for (let i = 0; i < listener.length; i++) {
                if (!listener[i] instanceof Function) {
                    logger.error(`InterCom:removeListener:listener expected Function but received ${typeof listener[i]} `);
                    return false;
                }
                for (let j = 0; j < this.client_sub_channel[channel + scope].length; j++) {
                    if (this.client_sub_channel[channel + scope][j] === listener[i]) {
                        this.client_sub_channel[channel + scope].splice(j, 1);
                        if (scope === INTERCOM_TYPE.EVENT_EMITTER) {
                            this.carriers.get(scope).removeListener(channel, listener[i]);
                        }
                        break;
                    }
                }
            }
        }
        else {
            if (!listener instanceof Function) {
                logger.error(`InterCom:removeListener:listener expected Function but received ${typeof listener} `);
                return false;
            }
            for (let j = 0; j < this.client_sub_channel[channel + scope].length; j++) {
                if (this.client_sub_channel[channel + scope][j] === listener) {
                    if (scope === INTERCOM_TYPE.EVENT_EMITTER) {
                        this.carriers.get(scope).removeListener(channel, listener);
                    }
                    this.client_sub_channel[channel + scope].splice(j, 1);
                    break;
                }
            }
        }
    }

    /**
     * add listener to client_sub_channel,
     * in order to manager theirs
     * @param {string} channel
     * @param {object} listener
     * @param {string} scope
     */
    _register_handler(channel, listener, scope) {
        if (!this.client_sub_channel[channel + scope]) {
            this.client_sub_channel[channel + scope] = [];
        }

        if (listener instanceof Array) {
            for (let i = 0; i < listener.length; i++) {
                if (!listener[i] instanceof Function) {
                    logger.error(`InterCom:on:listener expected Function but received ${typeof listener[i]} `);
                    return false;
                }
                if (this.client_sub_channel[channel + scope].includes(listener[i])) {
                    continue;
                }
                this.client_sub_channel[channel + scope].push(listener[i]);
            }
        }
        else {
            if (!listener instanceof Function) {
                logger.error(`InterCom:on:listener expected Function but received ${typeof listener} `);
                return false;
            }
            if (this.client_sub_channel[channel + scope].includes(listener)) {
                return;
            }
            this.client_sub_channel[channel + scope].push(listener);
        }
    }


    /**
     * quiet node redis pubsub
     * Safely (connections will be closed properly once all commands are sent)
     */
    end() {
        for (let carry of this.carriers.entries()) {
            if (carry[0] === INTERCOM_TYPE.EVENT_EMITTER) {
                for (let prop of Object.keys(this.client_sub_channel)) {
                    if (prop.endsWith(INTERCOM_TYPE.EVENT_EMITTER)) {
                        for (let i = 0; i < this.client_sub_channel[prop].length; i++) {
                            this.carriers.get(INTERCOM_TYPE.EVENT_EMITTER).removeListener(prop.replace(INTERCOM_TYPE.EVENT_EMITTER, ''), this.client_sub_channel[prop][i]);
                            this.removeListener(prop.replace(INTERCOM_TYPE.EVENT_EMITTER, ''), this.client_sub_channel[prop][i]);
                        }
                    }
                }
            }
            else {
                this.carriers.get(carry[0]).quit();
            }
        }
    }

    /**
     * end node redis pubsub
     * Dangerously (connections will be immediately terminated)
     */
    _kill() {
        for (let carry of this.carriers.entries()) {
            if (carry[0] === INTERCOM_TYPE.EVENT_EMITTER) {
                for (let prop of Object.keys(this.client_sub_channel)) {
                    if (prop.endsWith(INTERCOM_TYPE.EVENT_EMITTER)) {
                        for (let i = 0; i < this.client_sub_channel[prop].length; i++) {
                            this.carriers.get(INTERCOM_TYPE.EVENT_EMITTER).removeListener(prop.replace(INTERCOM_TYPE.EVENT_EMITTER, ''), this.client_sub_channel[prop][i]);
                            this.removeListener(prop.replace(INTERCOM_TYPE.EVENT_EMITTER, ''), this.client_sub_channel[prop][i]);
                        }
                    }
                }
            }
            else {
                this.carriers.get(carry[0]).end();
            }
        }
    }
}

module.exports = Intercom;