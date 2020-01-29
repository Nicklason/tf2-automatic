export interface UnknownDictionary<T> {
    [key: string]: T;
}

type UnknownDictionaryKnownValues = UnknownDictionary<number | boolean | string | UnknownDictionary<any>>;
