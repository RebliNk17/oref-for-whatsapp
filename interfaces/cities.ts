export interface ICity {
    id: number;
    name: string;
    area: number;
    countdown: number;
}

//     },
export interface ICities {
  [key: string]: ICity;
}