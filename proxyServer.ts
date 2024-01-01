import WebSocket from 'ws';
import {Chat, GroupChat, MessageMedia} from "whatsapp-web.js";
import {Client, LocalAuth} from 'whatsapp-web.js';
import qrcode from "qrcode-terminal";
import {createSticker} from "./stickerMaker/sticker";

import data from "./residence.json";
import {IAreas} from "./interfaces/areas";
import {ICities} from "./interfaces/cities";
import {ICountdown} from "./interfaces/countdown";
import {IAlarmFor} from "./interfaces/alarmFor";
import {AlertData} from "./interfaces/alerts";

const areas: IAreas = data.areas;
const cities: ICities = data.cities;
const countdown: ICountdown = data.countdown;
const alarmFor: IAlarmFor = data.alarmFor;

import conf from "./config.json";
import {IContacts} from "./interfaces/configs";

const config: IContacts = conf;
// Object to store messages
const messages: Record<string, AlertData> = {};

// Function to clean up old messages
const cleanupOldMessages = () => {
  const oneHourAgo = Date.now() - 3600000; // 1 hour in milliseconds
  Object.keys(messages).forEach(notificationId => {
    if (messages[notificationId].data.time < oneHourAgo) {
      delete messages[notificationId];
    }
  });
};

(async () => {
  let meshkastolimGroupChat: GroupChat | undefined;
  let myselfChat: GroupChat | undefined;
  let chats: Chat[] = [];
  
  async function initWhatsapp() {
    let interval: string | number | NodeJS.Timeout | undefined = undefined;
    const client = new Client(
      {authStrategy: new LocalAuth()}
    );
    client.on('qr', (qr: any) => {
      qrcode.generate(qr, {small: true});
    });
    
    // client.on("message", async (msg) => {
    //
    //   const messageChat = await msg.getChat();
    //   console.log("message from group", msg.body, messageChat.name);
    //   if (messageChat.isGroup && messageChat.name.includes('משקסטולים')) {
    //     setTimeout(async () => {
    //       await msg.react(randomEmoji());
    //     }, 1000);
    //   }
    // });
    
    client.on('ready', () => {
      console.log('Client is ready!');
      setTimeout(() => {
        myselfChat?.sendMessage("I'm now alive!")
        interval = setInterval(() => {
          myselfChat?.sendMessage("I'm still UP!")
        }, 1000 * 60 * 30)
      }, 10000);
    });
    
    client.on('disconnected', (reason) => {
      console.log('Client is disconnected from WhatsApp', reason);
      client.destroy();
      chats = [];
      meshkastolimGroupChat = undefined;
      clearInterval(interval)
      initWhatsapp();
    });
    
    await client.initialize();
    chats = await client.getChats();
    myselfChat = chats.find((chat: Chat) => chat.name.includes('בדיקה')) as GroupChat;
    meshkastolimGroupChat = chats.find((chat: Chat) => chat.name.includes('משקסטולים')) as GroupChat;
  }
  
  await initWhatsapp();
  const headers = {
    "Origin": "https://www.tzevaadom.co.il",
    "Host": "ws.tzevaadom.co.il:8443",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:87.0) Gecko/20100101 Firefox/87.0",
    "Connection": "Upgrade",
    "Upgrade": "websocket",
  };

// External WebSocket server URL
  const targetWsUrl: string = 'wss://ws.tzevaadom.co.il:8443/socket?platform=WEB';
  
  let wsClient: WebSocket;
  let reconnectInterval: number = 1000; // Initial reconnect interval in ms
  
  
  async function sendMessageToWhatsAppGroup(data: AlertData) {
    console.log('received from external server:', data);
    // return;
    
    if (data.type !== 'ALERT' || data.data.isDrill) {
      return;
    }
    const isAirplaneAlert = data.data.threat === 5;
    const alarmedCities = data.data.cities
    let areaName: string = "";
    let runTime = 999;
    let shouldAlert = false;
    
    for (const city of alarmedCities) {
      if (cities[city]) {
        const aCity = cities[city];
        const aAreaName = areas[aCity.area];
        const tempRunTime = aCity.countdown;
        if (alarmFor.areas.includes(aCity.area)) {
          if (tempRunTime < runTime) {
            runTime = tempRunTime;
            areaName = aAreaName;
          }
          shouldAlert = true;
        }
      }
    }
    
    
    let runTimeStr: string = "";
    if (runTime < 999) {
      runTimeStr = `זמן ריצה: ${(runTime < 999 ? countdown[runTime] : "")}`;
    }
    if (!shouldAlert) {
      return;
    }
    // Group users by their city preferences
    const groups = new Map<string, string[]>();
    let isAnyUserMatched = false;
    
    const nameToCities: Record<string, string[]> = {};
    // iterate key value pairs with config
    for (const [name, userCities] of Object.entries(config)) {
      nameToCities[name] = userCities.cities;
    }
    for (const [name, userCities] of Object.entries(nameToCities)) {
      const key = userCities.sort().join(',');
      if (userCities.some(city => alarmedCities.some(alertCity => alertCity.includes(city)))) {
        isAnyUserMatched = true;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)?.push(name);
      }
    }
    
    function findContactWithDefaultTrue(obj: IContacts): string {
      for (let key in obj) {
        if (obj[key].default) {
          return key;
        }
      }
      return Object.keys(obj)[0];
    }
    const defaultContact = findContactWithDefaultTrue(config);
    // Fallback if no user is matched
    if (!isAnyUserMatched) {
      groups.set('default', [defaultContact]);
    }
    
    for (const [groupName, users] of groups) {
      let shouldMention = groupName !== 'default';
      let usersToNotify = users.length > 0 ? users : defaultContact;
      let mentions: string[] = [];
      let text = `אזעקות ב${areaName} ${runTimeStr ? "(" + runTimeStr + ")" : ""}\n`;
      text += '\n';
      text += `ערים: ${alarmedCities.join(', ')}`;
      const strToPrint = config[users[0]].emojiConf?.text || config[defaultContact].emojiConf!.text;
      const houseType = config[users[0]].emojiConf?.emoji || config[defaultContact].emojiConf!.emoji
      const filename = await createSticker(
        strToPrint,
        isAirplaneAlert ? "plane" : "rocket",
        houseType,
        true,
        runTime < 999 ? countdown[runTime] : "",
      );
      const stickerToSend = MessageMedia.fromFilePath(filename);
      const stickerMessage = await meshkastolimGroupChat?.sendMessage(stickerToSend, {sendMediaAsSticker: true});
      
      for (const user of usersToNotify) {
        if (shouldMention && meshkastolimGroupChat?.participants) {
          for (const participant of meshkastolimGroupChat!.participants) {
            if (participant.id.user === config[user].phoneNumber) {
              mentions.push(participant.id._serialized);
              text += `@${participant.id.user} `;
            }
          }
        }
      }
      
      if (mentions.length > 0) {
        text += '\n';
        text += 'כנסו למרחב מוגן!!!!!';
        if (runTime < 999) {
          text += '\n';
          text += `יש לכם ${countdown[runTime]}`;
        }
      }
      
      setTimeout(async () => {
        // @ts-ignore
        const message = await stickerMessage?.reply(text, undefined, {mentions});
        setTimeout(() => {
          if (isAirplaneAlert) {
            message?.react('✈️')
          } else {
            message?.react('🚀')
          }
        }, 1500);
      }, 1500);
    }
  }
  
  // const tests = {
  //   "type": "ALERT",
  //   "data": {
  //     "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb7",
  //     "time": 1702827681,
  //     "threat": 5,
  //     "isDrill": false,
  //     "cities": ['קריית שמונה']
  //   }
  // }
  //
  // await sendMessageToWhatsAppGroup(tests)

// Create a WebSocket client to connect to the external server
  const connectToExternalServer = () => {
    wsClient = new WebSocket(targetWsUrl, {headers});
    
    wsClient.on('open', () => {
      console.log('Connected to external WebSocket server');
      reconnectInterval = 1000; // Reset reconnect interval after successful connection
    });
    
    wsClient.on('message', async (data: Buffer) => {
      const dataString = data.toString();
      const alertData = JSON.parse(dataString) as AlertData;
      
      if (messages[alertData.data.notificationId]) {
        return;
      }
      messages[alertData.data.notificationId] = alertData;
      await sendMessageToWhatsAppGroup(alertData);
    });
    
    wsClient.on('close', () => {
      console.log('Disconnected from external WebSocket server. Attempting to reconnect...');
      setTimeout(connectToExternalServer, reconnectInterval);
      reconnectInterval *= 2; // Exponential backoff
    });
    
    wsClient.on('error', (error: Error) => {
      console.error('WebSocket client error:', error);
    });
  };
  
  
  connectToExternalServer();
  
  function scheduleReconnect() {
    setInterval(() => {
      console.log('Reconnecting after one hour...');
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.close(); // This will trigger the 'close' event, which reconnects
      } else {
        connectToExternalServer(); // Connect if not already connected
      }
    }, 1000 * 60 * 60);
  }
  
  scheduleReconnect();
  
  setInterval(cleanupOldMessages, 1000 * 60 * 60 * 6); // Cleanup old messages every 6 hours
})();