export class SerialConnection {
    constructor(baudRate = 9600) {
        this.baudRate = baudRate;
        this.port = null;
        this.writer = null;
        this.onDisconnectCallback = null;
    }

    /**
     * Connect to the serial port.
     */
    async connect() {
        if (!navigator.serial) {
            throw new Error('Web Serial API not supported in this browser.');
        }

        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: this.baudRate });
        this.writer = this.port.writable.getWriter();

        this.port.addEventListener('disconnect', this._handleDisconnect.bind(this));
        
        return true;
    }

    /**
     * Internal handler for unexpected disconnections.
     */
    _handleDisconnect() {
        this.writer = null;
        this.port = null;
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    /**
     * Set a callback for when the device disconnects.
     */
    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    /**
     * Write data to the serial port.
     * @param {Uint8Array} data 
     */
    async write(data) {
        if (!this.writer) {
            throw new Error('Not connected to serial port.');
        }
        await this.writer.write(data);
    }

    /**
     * Disconnect gracefully.
     */
    async disconnect() {
        if (this.writer) {
            await this.writer.releaseLock();
            this.writer = null;
        }
        if (this.port) {
            await this.port.close();
            this.port = null;
        }
    }
}
