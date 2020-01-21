declare module 'tf2-currencies' {
    class Currencies {
        /**
         * Converts value into a currencies object
         * @param value Value in scrap
         * @param conversion Key conversion rate in refined
         */
        static toCurrencies (value: number, conversion?: number): Currencies;

        /**
         * Converts scrap to refined
         * @param scrap
         */
        static toRefined (scrap: number): number;

        /**
         * Converts refined to scrap
         * @param refined
         */
        static toScrap (refined: number): number;

        /**
         * Adds refined values together
         * @param arg A list of postive or negative refined values
         */
        static addRefined (...arg: number[]): number;

        /**
         * Creates a new instance of Currencies
         * @param currencies
         */
        constructor (currencies: { keys?: number, metal?: number });

        keys: number;
        metal: number;

        /**
         * Returns value of the instance in scrap
         * @param conversion Key conversion rate in refined
         */
        toValue (conversion?: number): number;

        /**
         * Returns a string that represents the values of the instance
         * @description Example: 10 keys, 13.88 ref
         */
        toString (): string;
    }

    export = Currencies;
}
