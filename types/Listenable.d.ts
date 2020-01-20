declare interface Listenable {
    listeners: Function;
    once: Function;
    on: Function;
    removeListener: Function;
    removeAllListeners: Function;
}