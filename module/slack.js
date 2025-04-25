// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const md5 = require('md5');
const moment = require("moment");
const logger = require("../module/logger.js");
const token = require("../config/token.json");
const { WebClient, LogLevel } = require("@slack/web-api");

class Slack {
    constructor() {
        this.last_publish_ts = moment(new Date());
        this.send_map = {};
        this.client = new WebClient(token.token, {
            // LogLevel can be imported and used to make debugging simpler
            // logLevel: LogLevel.DEBUG
        });
    }

    async publishMessage(id, text) {
        let that = this;

        if (moment(new Date()).diff(that.last_publish_ts, "second") < 10) {
            // 短时间内发送太多消息，本消息被过滤掉
            // return;
        }

        let hash_text = md5(text);
        if ((hash_text in that.send_map) && (moment(new Date()).diff(that.send_map[hash_text], "minute") < 60)) {
            // 同样的消息一小时内只发送一次
            return;
        }
        
        try {
            if (hash_text in that.send_map) text = "again: " + text;
            // Call the chat.postMessage method using the built-in WebClient
            const result = await that.client.chat.postMessage({
                // The token you used to initialize your app
                token: token.token,
                channel: id,
                text: text
                // You could also use a blocks[] array to send richer content
            });
    
            that.send_map[hash_text] = moment(new Date());

            for (let [key, value] of Object.entries(that.send_map)) {
                // 如果超过两天都没有更新了，那就可以删掉了
                if (moment(new Date()).diff(value, "hour") > 48) {
                    delete that.send_map[key];
                }
            }

            // Print result, which includes information about the message (like TS)
            // if success
            // logger.info(JSON.stringify(result));
        } catch (error) {
            logger.error(error);
        }

        this.last_publish_ts = moment(new Date());
    }

    alert(text) {
        this.publishMessage("alert", text);
    }

    info(text) {
        this.publishMessage("info", text);
    }

    warn(text) {
        this.publishMessage("warn", text);
    }
}

module.exports = {
    Slack: Slack
};