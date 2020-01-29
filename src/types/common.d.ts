export interface UnknownDictionary<T> {
    [key: string]: T;
}

type UnknownDictionaryKnownValues = UnknownDictionary<number | boolean | string | null | UnknownDictionary<any>>;
