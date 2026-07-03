export class Printer {
    /**
     * @param {Object} connection - An instance of SerialConnection or BluetoothConnection
     */
    constructor(connection) {
        this.connection = connection;
        this.PRINTER_WIDTH_PX = 384;
        
        // ESC/POS Commands
        this.CMD_INIT = new Uint8Array([0x1B, 0x40]);
        this.CMD_FEED = new Uint8Array([0x0A]);
    }

    /**
     * Build a complete GS v 0 command for a slice of pixels.
     * Header (8 bytes) + slice data combined into one atomic buffer.
     * Sending header+data as one write() is critical for BLE,
     * where each write() is a discrete packet.
     */
    _buildSliceCommand(sliceHeight, slicePixelData) {
        const widthInBytes = this.PRINTER_WIDTH_PX / 8; // 48
        const header = new Uint8Array([
            0x1D, 0x76, 0x30, 0x00, // 'GS v 0' command, mode 0
            widthInBytes, 0,         // Width (L/H)
            sliceHeight, 0           // Height (L/H)
        ]);
        // Combine header + data into one buffer
        const command = new Uint8Array(header.length + slicePixelData.length);
        command.set(header, 0);
        command.set(slicePixelData, header.length);
        return command;
    }

    /**
     * Converts raw ImageData to printer ESC/POS commands and sends them.
     * Batches multiple complete row commands into a single write() to reduce
     * BLE round-trip overhead. Each row is a self-contained 56-byte GS v 0
     * command (header+data), so the printer processes them sequentially
     * even when concatenated.
     *
     * @param {ImageData} imageData - The un-thresholded image data
     * @param {number} contrastThreshold - 0-255 threshold
     * @param {boolean} feedPaper - Whether to feed paper after printing
     * @param {function} logCallback - Optional callback for logging progress
     */
    async printImage(imageData, contrastThreshold, feedPaper = true, logCallback = () => {}) {
        if (!this.connection) {
            throw new Error("No active connection.");
        }

        const ROW_CMD_SIZE = 56; // 8 header + 48 data
        const ROWS_PER_BATCH = 4; // 4 × 56 = 224 bytes per write
        const width = imageData.width;
        const height = imageData.height;
        const sliceWidthInBytes = this.PRINTER_WIDTH_PX / 8; // 48

        const isPixelBlack = (x, y) => {
            const index = (y * width + x) * 4;
            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            const average = (0.2126 * r + 0.7152 * g + 0.0722 * b);
            return (average < contrastThreshold);
        };

        logCallback('Sending INIT command...');
        await this.connection.write(this.CMD_INIT);

        logCallback(`Printing ${height} rows (batched ${ROWS_PER_BATCH} per write)...`);

        for (let yStart = 0; yStart < height; yStart += ROWS_PER_BATCH) {
            const batchEnd = Math.min(yStart + ROWS_PER_BATCH, height);
            const batchSize = batchEnd - yStart;

            // Build a buffer containing multiple complete row commands
            const batch = new Uint8Array(batchSize * ROW_CMD_SIZE);

            for (let i = 0; i < batchSize; i++) {
                const y = yStart + i;
                const rowData = new Uint8Array(sliceWidthInBytes);
                for (let x_byte = 0; x_byte < sliceWidthInBytes; x_byte++) {
                    let horizontalByte = 0;
                    for (let bit = 0; bit < 8; bit++) {
                        const currentX = (x_byte * 8) + bit;
                        if (isPixelBlack(currentX, y)) {
                            horizontalByte |= (1 << (7 - bit));
                        }
                    }
                    rowData[x_byte] = horizontalByte;
                }
                const command = this._buildSliceCommand(1, rowData);
                batch.set(command, i * ROW_CMD_SIZE);
            }

            await this.connection.write(batch);

            if (yStart > 0 && yStart % 50 === 0) {
                logCallback(`  Row ${yStart}/${height}...`);
            }
        }

        if (feedPaper) {
            logCallback('Feeding paper...');
            await this.connection.write(this.CMD_FEED);
            await this.connection.write(this.CMD_FEED);
            await this.connection.write(this.CMD_FEED);
        }
        logCallback('Print job complete.');
    }
}
