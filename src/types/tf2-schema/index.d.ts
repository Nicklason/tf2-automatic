declare module 'tf2-schema' {
    import StrictEventEmitter from 'strict-event-emitter-types';
    import { EventEmitter } from "events";

    interface Events {
        schema: (schema: SchemaManager.Schema) => void;
    }

    export = SchemaManager;

    class SchemaManager extends EventEmitter implements StrictEventEmitter<EventEmitter, Events> {
        /**
         * Creates a new instance of SchemaManager
         * @param options
         */
        constructor (options: { apiKey?: string, updateTime?: number });

        apiKey: string|undefined;
        updateTime: number;

        ready: boolean;

        schema: SchemaManager.Schema|null;

        /**
         * Inititalizes SchemaManager
         * @param callback 
         */
        init (callback: Function);

        /**
         * Set schema
         * @param data
         * @param fromUpdate
         */
        setSchema (data: object, fromUpdate?: boolean);

        /**
         * Gets schema data and updates current schema / creates new instance
         * @param callback 
         */
        getSchema (callback: Function);
    }

    namespace SchemaManager {
        interface SchemaItem {
            name: string;
            defindex: number;
            item_class: string;
            item_class_name: string;
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
    
        export class Schema {
            /**
             * Gets schema overview
             * @param apiKey 
             * @param callback 
             */
            static getOverview (apiKey: string, callback: Function);
    
            /**
             * Gets schema items
             * @param apiKey 
             * @param callback 
             */
            static getItems (apiKey: string, callback: Function);
    
            /**
             * Gets skins / paintkits
             * @param callback 
             */
            static getPaintKits (callback: Function);
    
            /**
             * Gets items_game.txt
             * @param callback 
             */
            static getItemsGame (callback: Function);
    
            /**
             * Creates a new instance of Schema
             * @param data
             */
            constructor (data: { version: string, raw: object, time: number });
    
            version: string;
            raw: object;
            time: number
    
            /**
             * Gets schema item by defindex
             * @param defindex 
             */
            getItemByDefindex (defindex: number): SchemaItem|null;
    
            /**
             * Gets schema item by item name
             * @param name 
             */
            getItemByItemName (name: string): SchemaItem|null;
    
            /**
             * Gets attribute by defindex
             * @param defindex 
             */
            getAttributeByDefindex (defindex: number): SchemaAttribute|null;
    
            /**
             * Gets quality by id
             * @param id 
             */
            getQualityById (id: number): string|null;
    
            /**
             * Gets quality id by name
             * @param name 
             */
            getQualityIdByName (name: string): number|null;
    
            /**
             * Gets effect by id
             * @param id 
             */
            getEffectById (id: number): string|null;
    
            /**
             * Get effect id by name
             * @param name 
             */
            getEffectIdByName (name: string): number|null;
    
            /**
             * Get skin by id
             * @param id 
             */
            getSkinById (id: number): string|null;
    
            /**
             * Get skin id by name
             * @param name 
             */
            getSkinIdByName (name: string): number|null;
    
            /**
             * Gets name of an item
             * @param item
             * @param proper Adds "The" if proper_name of schema item is true
             */
            getName (item: Item, proper?: boolean): string|null;
    
            /**
             * Returns data used to construct schema
             */
            toJSON (): { version: string, time: number, raw: object };
        }
    }
}
