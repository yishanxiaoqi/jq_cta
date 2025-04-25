import json
import redis
from telethon import TelegramClient, events

with open('./config/token.json') as fp:
    apicfg = json.load(fp)

# 替换成你自己的 API ID 和 HASH
api_id = apicfg['telethon']['api_id']          # 你的 API ID
api_hash = apicfg['telethon']['api_hash']        # 你的 API HAS H

# 创建客户端
client = TelegramClient('session_name', api_id, api_hash)

# 创建redis
r = redis.Redis(host='localhost', port=6379, password='pass1')

# 监听所有频道新消息（包括群组和私聊）
# 注意这里一定是@channel的格式
# @client.on(events.NewMessage(chats="@BnAnn_bot"))  # 可以改成 chats='频道用户名' 来监听特定频道
@client.on(events.NewMessage(chats="@binance_announcements"))  # 可以改成 chats='频道用户名' 来监听特定频道
async def handler(event):
    sender = await event.get_sender()
    sender_name = sender.username or sender.first_name or "未知发送者"
    msg = f"📥 收到来自 {sender_name} 的新消息：{event.text}"
    print(msg)

    # 对数据进行筛选，如果包含vote to list, vote to delist, monitoring tags, seed tags等词汇则打电话报警
    text = event.text.lower()
    if (("vote to list" in text) or ("vote to delist" in text) or ("binance will delist" in text) or ('monitoring tag' in text)):
        r.publish('strategy:TWILIO_CALL', json.dumps({"type": "ANNOUNCEMENT"}))

    # 公告通过slack进行转发
    p_msg = msg.split("(https://www.binance.com")[0]
    r.publish('strategy:SLACK_PUBLISH', json.dumps({"type": "alert", "msg": p_msg}))

# 启动客户端
client.start()
print("📡 正在监听 Telegram 频道消息...")
client.run_until_disconnected()
