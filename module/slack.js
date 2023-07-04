// Require the Node Slack SDK package (github.com/slackapi/node-slack-sdk)
const logger = require("../module/logger.js");
const { WebClient, LogLevel } = require("@slack/web-api");

class Slack {
    constructor() {
        this.client = new WebClient("xoxb-5371587372357-5371693295861-6k9SIqDOGXaQHYzPOPujhbr0", {
            // LogLevel can be imported and used to make debugging simpler
            // logLevel: LogLevel.DEBUG
        });
    }

    async publishMessage(id, text) {
        try {
            // Call the chat.postMessage method using the built-in WebClient
            const result = await this.client.chat.postMessage({
                // The token you used to initialize your app
                token: "xoxb-5371587372357-5371693295861-6k9SIqDOGXaQHYzPOPujhbr0",
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