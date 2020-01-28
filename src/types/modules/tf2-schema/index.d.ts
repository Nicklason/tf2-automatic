declare module 'tf2-schema' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from "events";

    interface Events {
        schema: (schema: SchemaManager.Schema) => void;
    }

    export = SchemaManager;

    class SchemaManager extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        apiKey: string|undefined;
        updateTime: number;
        ready: boolean;
        schema: SchemaManager.Schema|null;

        _updateTimeout: ReturnType<typeof setTimeout>;
        _updateInterval: ReturnType<typeof setInterval>;

        constructor (options: { apiKey?: string, updateTime?: number });

        init (callback: Function): void;
        setSchema (data: object, fromUpdate?: boolean): void;
        getSchema (callback: Function): void;
    }

    namespace SchemaManager {
        export interface SchemaItem {
            name: string;
            defindex: number;
            item_class: string;
            item_type_name: string;
            item_name: string;
            item_description: string;
            proper_name: boolean;
            model_player?: string|null;
            item_quality: number;
            image_inventory: string;
            min_ilevel: number;
            max_ilevel: number;
            image_url: string|null;
            image_url_large: string|null;
            drop_type?: string
            craft_class?: string;
            craft_material_type?: string;
            capabilities?: {
                decodeable?: boolean,
                paintable?: boolean,
                nameable?: boolean,
                useable_gc?: boolean,
                can_craft_if_purchased?: boolean,
                can_gift_wrap?: boolean,
                usable_out_of_game?: boolean,
                can_craft_count?: boolean,
                can_craft_mark?: boolean,
                can_be_restored?: boolean,
                strange_parts?: boolean,
                can_card_upgrade?: boolean,
                can_stringify?: boolean,
                can_killstreakify?: boolean,
                can_consume?: boolean
            };
            styles?: [{
                name: string
            }];
            tool?: {
                type: string,
                use_string?: string,
                restriction?: string,
                usage_capabilities?: {
                    decodeable?: boolean,
                    paintable?: boolean,
                    can_customize_texture?: boolean,
                    can_gift_wrap?: boolean,
                    paintable_team_colors?: boolean
                }
            };
            used_by_classes: string[];
            attributes: [{
                name: string,
                class: string,
                value: number,
            }];
        }
    
        interface SchemaAttribute {
            name: string;
            defindex: number;
            attribute_class: string;
            description_string?: string;
            description_format?: string;
            effect_type: string;
            hidden: boolean;
            stored_as_integer: boolean;
        }
    
        interface Item {
            defindex: number;
            quality: number;
            craftable?:  boolean;
            tradable?: boolean;
            killstreak?: number;
            australium?: boolean;
            effect?: number;
            festive?: boolean;
            paintkit?: number;
            wear?: number;
            quality2?: number;
            target?: number;
            craftnumber?: number;
            crateseries?: number;
            output?: number;
            outputQuality?: number;
        }
    
        export class Schema {
            static getOverview (apiKey: string, callback: Function): void;
            static getItems (apiKey: string, callback: Function): void;
            static getPaintKits (callback: Function): void;
            static getItemsGame (callback: Function): void;
            
            version: string;
            raw: {
                schema: {
                    items: SchemaItem[]
                },
                items_game: {
                    items: object
                }
            };
            time: number
    
            constructor (data: { version: string, raw: object, time: number });
    
            getItemByDefindex (defindex: number): SchemaItem|null;
            getItemByItemName (name: string): SchemaItem|null;
            getAttributeByDefindex (defindex: number): SchemaAttribute|null;
            getQualityById (id: number): string|null;
            getQualityIdByName (name: string): number|null;
            getEffectById (id: number): string|null;
            getEffectIdByName (name: string): number|null;
            getSkinById (id: number): string|null;
            getSkinIdByName (name: string): number|null;
            getName (item: Item, proper?: boolean): string|null;
            toJSON (): { version: string, time: number, raw: object };
        }
    }
}
