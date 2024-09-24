
export interface AlertData {
  type: string;
  data: AlertInfo;
  isSent?: boolean;
}

export interface AlertInfo {
  notificationId: string;
  time: number;
  threat?: number;
  isDrill: boolean;
  cities: string[];
}