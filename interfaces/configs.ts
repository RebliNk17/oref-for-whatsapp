
export type Emoji = "home" | "hotel" | "building" | "hospital" | string;

export interface IEmojiConf {
  text: string;
  emoji: Emoji;
}

export interface IContact {
  phoneNumber: string;
  cities: string[];
  emojiConf?: IEmojiConf;
  default?: boolean;
}

export interface IContacts {
  [key: string]: IContact;
}