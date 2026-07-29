export class BluetoothConnection {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.onDisconnectCallback = null;
    }

    /**
     * Connect via Web Bluetooth.
     */
    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth API not supported in this browser.');
        }

        this.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb', // Common printer service
                '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Another common BLE SPP
                '0000180f-0000-1000-8000-00805f9b34fb', // Battery (sometimes bundled)
                '0000af30-0000-1000-8000-00805f9b34fb', // Cat Printer Advertisement (Discovery)
                '0000ae30-0000-1000-8000-00805f9b34fb', // Cat Printer Primary Service (Interaction)
                '0000ff00-0000-1000-8000-00805f9b34fb', // Generic / Phomemo / PeriPage
            ]
        });

        this.device.addEventListener('gattserverdisconnected', this._handleDisconnect.bind(this));

        this.server = await this.device.gatt.connect();
        
        // Find a writable characteristic
        const services = await this.server.getPrimaryServices();
        
        for (const service of services) {
            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    this.characteristic = char;
                    break;
                }
            }
            if (this.characteristic) break;
        }

        if (!this.characteristic) {
            throw new Error("Could not find a writable characteristic on this device.");
        }

        return true;
    }

    _handleDisconnect() {
        this.server = null;
        this.characteristic = null;
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    /**
     * Write data to the Bluetooth characteristic.
     * Prefers writeWithoutResponse (fire-and-forget) to eliminate the 
     * ~10-15ms ACK idle time between every packet. Falls back to 
     * writeValue (with ACK) if the characteristic doesn't support it.
     * @param {Uint8Array} data 
     */
    async write(data) {
        if (!this.characteristic) {
            throw new Error('Not connected to Bluetooth device.');
        }

        if (this.characteristic.properties.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(data);
        } else {
            await this.characteristic.writeValue(data);
        }
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.server = null;
        this.characteristic = null;
    }
}
