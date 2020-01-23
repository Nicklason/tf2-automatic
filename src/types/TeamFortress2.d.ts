import { UnknownDictionary } from './common';

export interface ItemsDictionaryWithAmounts extends UnknownDictionary<number> {

}

export interface Currency {
    keys: number;
    metal: number;
}

export interface Item {
    defindex: number;
    quality: number;
    craftable?:  boolean;
    tradable?: boolean;
    killstreak?: number;
    australium?: boolean;
    effect?: number|null;
    festive?: boolean;
    paintkit?: string|null;
    wear?: number|null;
    quality2?: number|null;
    target?: number|null;
    craftnumber?: number|null;
    crateseries?: number|null;
    output?: number|null;
    outputQuality?: number|null;
}
