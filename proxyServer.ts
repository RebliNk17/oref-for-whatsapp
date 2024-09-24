import WebSocket from 'ws';
import { Chat, Contact, GroupChat, GroupParticipant, Message, MessageMedia } from "whatsapp-web.js";
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from "qrcode-terminal";
import { createSticker } from "./stickerMaker/sticker";

import data from "./residence.json";
import { IAreas } from "./interfaces/areas";
import { ICities } from "./interfaces/cities";
import { ICountdown } from "./interfaces/countdown";
import { IAlarmFor } from "./interfaces/alarmFor";
import { AlertData } from "./interfaces/alerts";

const areas: IAreas = data.areas;
const cities: ICities = data.cities;
const countdown: ICountdown = data.countdown;
const alarmFor: IAlarmFor = data.alarmFor;

import conf from "./config.json";
import { Emoji, IContacts } from "./interfaces/configs";
import * as fs from "fs";

const contactMapping: IContacts = conf;
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

  let aggregatedAlerts: AlertData[] = [];
  let lastWhatsAppMessage: {
    message?: Message; // to store the WhatsApp message object
    time: number; // timestamp of the last sent message
  } | null = null;
  let messageEditTimeout: NodeJS.Timeout | null = null;
  const contacts: Record<string, Contact> = {};

  async function initWhatsapp() {
    let interval: string | number | NodeJS.Timeout | undefined = undefined;
    const client = new Client(
      {
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
        }
      }
    );
    client.on('qr', (qr: any) => {
      qrcode.generate(qr, { small: true });
    });

    client.on("message", async (msg) => {
      const messageChat = await msg.getChat();
      if (messageChat.id?._serialized === meshkastolimGroupChat?.id?._serialized) {
        console.log(msg.author)
      }
    });


    const tests: AlertData[] = [{
      "type": "ALERT",
      "data": {
        "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb7",
        "time": (Date.now() + 1000) / 1000,
        "threat": 5,
        "isDrill": false,
        "cities": ['קריית שמונה']
      }
    }, {
      "type": "ALERT",
      "data": {
        "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb8",
        "time": (Date.now() + 1000) / 1000,
        "threat": 5,
        "isDrill": false,
        "cities": ['עמוקה']
      }
    },
    {
      "type": "ALERT",
      "data": {
        "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb1",
        "time": (Date.now() + 1000) / 1000,
        "cities": [
          "קצרין",
          "קצרין - אזור תעשייה"
        ],
        "threat": 0,
        "isDrill": false
      }
    },
    {
      "type": "ALERT",
      "data": {
        "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb2",
        "time": (Date.now() + 1000) / 1000,
        "cities": [
          "מלון פרא",
          "קדמת צבי"
        ],
        "threat": 0,
        "isDrill": false
      }
    },
    {
      "type": "ALERT",
      "data": {
        "notificationId": "aecf1eac-e811-4bfb-876d-e9b28fed2cb3",
        "time": (Date.now() + 1000) / 1000,
        "cities": [
          "רפטינג נהר הירדן"
        ],
        "threat": 0,
        "isDrill": false
      }
    }]

    client.on('ready', async () => {
      console.log('Client is ready!');
      console.log("getting chats");
      chats = await client.getChats();
      console.log("chats count", chats.length);
      myselfChat = chats.find((chat: Chat) => chat.name.includes('בדיקה')) as GroupChat;
      meshkastolimGroupChat = chats.find((chat: Chat) => chat.name.includes('משקסטולים')) as GroupChat;
      // meshkastolimGroupChat = chats.find((chat: Chat) => chat.name.includes('בדיקה')) as GroupChat;

      const allContacts = await client.getContacts();
      Object.values(contactMapping).forEach(async (contact) => {
        try {
          contacts[contact.phoneNumber] = allContacts.find((c: Contact) => c.number === contact.phoneNumber) as Contact;
        } catch (error) {
          console.error('Error getting contact by phone number:', error);
        }
      });

      initMessageSending();

      console.log("received chats", myselfChat?.id._serialized, meshkastolimGroupChat?.id._serialized);

      setTimeout(() => {
        myselfChat?.sendMessage("I'm now alive!")
        interval = setInterval(() => {
          myselfChat?.sendMessage("I'm still UP!")
        }, 1000 * 60 * 30) // 30 minutes
      }, 1000 * 10);
    });

    client.on('disconnected', (reason) => {
      console.log('Client is disconnected from WhatsApp', reason);
      client.destroy();
      chats = [];
      meshkastolimGroupChat = undefined;
      clearInterval(interval)
      initWhatsapp();
    });

    client.initialize();
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

  function buildWhatsAppMessageFromAlerts(alerts: AlertData[]): { messageText: string, mentions: Contact[] } {
    const groupedByArea: {
      [areaName: string]: {
        cities: string[],
        runTime: string,
        mentions: Set<Contact>
      }
    } = {};

    const mentions: Contact[] = []; // Array to store unique user mentions

    // Tag users based on their city preferences
    const alreadyTaggedUsers: Set<string> = new Set(); // To keep track of who is already tagged
    const nameToCities: Record<string, string[]> = {};

    for (const [name, userCities] of Object.entries(contactMapping)) {
      nameToCities[name] = userCities.cities;
    }

    // Group cities by area name, and track the minimum run time for each area
    alerts.forEach(alert => {
      const alarmedCities = alert.data.cities;
      let runTime = 999;

      alarmedCities.forEach(city => {
        if (cities[city]) {
          const aCity = cities[city];
          if (!aCity) {
            console.log(`City ${city} not found`);
            return;
          }
          const aAreaName = areas[aCity.area] || 'אזור לא ידוע';
          const tempRunTime = aCity.countdown;

          // If this area is not already in the group, initialize it
          if (!groupedByArea[aAreaName]) {
            groupedByArea[aAreaName] = { cities: [], runTime: '', mentions: new Set() };
          }

          // Add the city to the area
          groupedByArea[aAreaName].cities.push(city);

          // Update the area's minimum run time if necessary
          if (tempRunTime < runTime) {
            runTime = tempRunTime;
            groupedByArea[aAreaName].runTime = runTime < 999 ? `זמן ריצה: ${countdown[runTime]}` : '';
          }

          // Tag users who have this city in their preferences
          for (const [name, userCities] of Object.entries(nameToCities)) {
            if (userCities.includes(city)) {
              if (!alreadyTaggedUsers.has(name)) {
                const contact = contacts[contactMapping[name].phoneNumber];
                alreadyTaggedUsers.add(name);
                if (contact) {
                  groupedByArea[aAreaName].mentions.add(contact);
                }
              }
            }
          }
        }
      });
    });

    // Build message by area
    let messageText = '';
    Object.keys(groupedByArea).forEach(areaName => {
      const { cities, runTime } = groupedByArea[areaName];
      messageText += `אזעקות ב${areaName} ${runTime ? `*(${runTime}*)` : ''}\n`;
      messageText += `ערים: ${cities.join(', ')}\n`;
      // add mentions  to the message
      for (const mention of groupedByArea[areaName].mentions) {
        messageText += `@${mention.number} - יש לך ${runTime.replace("זמן ריצה:", "")} לרוץ למרחב מוגן!!!\n`;
      }
      messageText += '\n';
    });

    return {
      messageText: messageText.trim(),
      mentions: Array.from(mentions)
    };
  }


  async function sendOrEditWhatsAppMessage(shouldEdit: boolean, groupChat: GroupChat | undefined, messageContent: string, mentions: Contact[]) {
    if (!groupChat) {
      return;
    }
    const currentTime = Date.now() / 1000;
    let message = lastWhatsAppMessage?.message;
    if (shouldEdit) {
      // Edit the previous message
      await lastWhatsAppMessage?.message!.edit(messageContent, { mentions });
    } else {
      // Send a new message
      message = await groupChat.sendMessage(messageContent, { mentions: mentions.map(m => m.id._serialized) });
    }
    lastWhatsAppMessage = {
      message,
      time: currentTime
    };

  }

  async function sendStickerIfNeeded(alert: AlertData) {
    // send a sticker if one of the contacts has a city that is under attack
    const alertCities = alert.data.cities;
    const contacts = Object.values(contactMapping);
    const isAirplaneAlert = alert.data.threat === 5;
    let runTime = 999;

    for (const contact of contacts) {
      if (alertCities.some(city => contact.cities.includes(city))) {
        runTime = Math.min(...alertCities.map((city: string) => cities[city].countdown));
        const strToPrint = contact.emojiConf?.text || '';
        const houseType = contact.emojiConf?.emoji || 'home';
        const filename = await createSticker(
          strToPrint,
          isAirplaneAlert ? "plane" : "rocket",
          houseType,
          true,
          runTime < 999 ? countdown[runTime] : "",
        );
        const stickerToSend = MessageMedia.fromFilePath(filename);
        await meshkastolimGroupChat?.sendMessage(stickerToSend, { sendMediaAsSticker: true });
      }
    }
  }

  function handleIncomingAlert(data: AlertData) {
    if (data.type !== 'ALERT' || data.data.isDrill) {
      return;
    }

    sendStickerIfNeeded(data);
    data.isSent = false;
    aggregatedAlerts.push(data);
  }

  // Create a WebSocket client to connect to the external server
  const connectToExternalServer = () => {
    console.log('Trying to connect to external WebSocket server...');
    wsClient = new WebSocket(targetWsUrl, { headers });

    wsClient.on('open', () => {
      console.log('Connected to external WebSocket server');
      reconnectInterval = 1000; // Reset reconnect interval after successful connection
    });

    wsClient.on('message', async (data: Buffer) => {
      const alertData = JSON.parse(data.toString()) as AlertData;
      if (!messages[alertData.data.notificationId]) {
        messages[alertData.data.notificationId] = alertData;
        try {
          await handleIncomingAlert(alertData); // Handle and aggregate the message
        } catch (error) {
          console.error('Error handling incoming alert:', error);
        }
      }
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

  function initMessageSending() {
    setInterval(async () => {
      try {
        // Get unsent alerts
        const unsentAlerts = aggregatedAlerts.filter(alert => !alert.isSent);
        if (unsentAlerts.length === 0) {
          return;
        }
  
        const currentTime = Date.now() / 1000;
  
        const shouldEdit = lastWhatsAppMessage && (currentTime - lastWhatsAppMessage.time < 60) || false;

        // Build the message content from unsent alerts
        const { messageText, mentions } = buildWhatsAppMessageFromAlerts(aggregatedAlerts);
        
        for (const alert of unsentAlerts) {
          alert.isSent = true;
        }

        await sendOrEditWhatsAppMessage(shouldEdit, meshkastolimGroupChat, messageText, mentions);
  
        // After sending, mark the alerts as sent
        if (!shouldEdit) {
          // If we sent a new message, update lastWhatsAppMessage time
          lastWhatsAppMessage!.time = currentTime;
        }
  
        // Optional: Clean up old alerts to prevent memory leaks
        aggregatedAlerts = aggregatedAlerts.filter(alert => (currentTime - alert.data.time) < 120); // Keep alerts from the last 2 minutes
      } catch (error) {
        console.error('Error sending WhatsApp message:', error);
      }
    }, 1000 * 5); // Check every 5 seconds
  }  

  connectToExternalServer();

  function scheduleReconnect() {
    setInterval(() => {
      console.log('Reconnecting after one hour...');
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.close(); // This will trigger the 'close' event, which reconnects
      } else {
        connectToExternalServer(); // Connect if not already connected
      }
    }, 1000 * 60 * 60 * 2); // Reconnect every 2 hours
  }

  scheduleReconnect();

  setInterval(cleanupOldMessages, 1000 * 60 * 60 * 6); // Cleanup old messages every 6 hours
})();