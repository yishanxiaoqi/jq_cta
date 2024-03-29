// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const moment = require("moment");
const logger = require("../module/logger.js");
const token = require("../config/token.json");
const { WebClient, LogLevel } = require("@slack/web-api");

class Slack {
    constructor() {
        this.last_publish_ts = moment(new Date());
        this.client = new WebClient(token.token, {
            // LogLevel can be imported and used to make debugging simpler
            // logLevel: LogLevel.DEBUG
        });
    }

    async publishMessage(id, text) {
        if (moment(new Date()).diff(this.last_publish_ts, "second") < 10) {
            // 短时间内发送太多消息，本消息被过滤掉
            // return;
        }
        
        try {
            // Call the chat.postMessage method using the built-in WebClient
            const result = await this.client.chat.postMessage({
                // The token you used to initialize your app
                token: token.token,
                channel: id,
                text: text
                // You could also use a blocks[] array to send richer content
            });
    
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