export class ImageProcessor {
    /**
     * Renders a string of text onto an offscreen canvas and returns an Image object.
     * @param {string} text - The text to render
     * @param {number} width - The width of the image (printer width)
     * @returns {Promise<HTMLImageElement>}
     */
    static async generateImageFromText(text, width = 384) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const fontSize = 20;
                const lineHeight = 24;
                const padding = 5;
                ctx.font = `${fontSize}px sans-serif`;

                const paragraphs = text.split('\n');
                const lines = [];

                for (const para of paragraphs) {
                    const words = para.split(' ');
                    let currentLine = '';
                    for (const word of words) {
                        const testLine = currentLine + word + ' ';
                        const metrics = ctx.measureText(testLine);
                        if (metrics.width > (width - padding * 2) && currentLine !== '') {
                            lines.push(currentLine.trim());
                            currentLine = word + ' ';
                        } else {
                            currentLine = testLine;
                        }
                    }
                    lines.push(currentLine.trim());
                }

                const canvasHeight = (lines.length * lineHeight) + (padding * 2);
                canvas.width = width;
                canvas.height = canvasHeight;

                // Re-apply styles after resize
                ctx.fillStyle = '#FFFFFF'; // White background
                ctx.fillRect(0, 0, width, canvasHeight);
                ctx.fillStyle = '#000000'; // Black text
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textBaseline = 'top';

                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], padding, padding + (i * lineHeight));
                }

                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to create image from text'));
                img.src = canvas.toDataURL();
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Draws an image to a canvas, applies B&W threshold, and returns the ImageData.
     * Useful for previewing what the printer will print.
     * @param {HTMLCanvasElement} canvas - The preview canvas
     * @param {HTMLImageElement} img - The source image
     * @param {number} printerWidth - Target width
     * @param {number} contrastThreshold - Threshold for B&W
     * @returns {ImageData} - The thresholded image data
     */
    static processForPreview(canvas, img, printerWidth, contrastThreshold) {
        if (!img) return null;

        const ctx = canvas.getContext('2d');
        const scaledHeight = Math.floor(img.height * (printerWidth / img.width));

        canvas.width = printerWidth;
        canvas.height = scaledHeight;

        // Draw original
        ctx.drawImage(img, 0, 0, printerWidth, scaledHeight);

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, printerWidth, scaledHeight);
        const data = imageData.data;

        // Apply Threshold
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const average = (0.2126 * r + 0.7152 * g + 0.0722 * b);
            const bw = average < contrastThreshold ? 0 : 255;
            data[i] = bw;
            data[i + 1] = bw;
            data[i + 2] = bw;
            // Alpha remains unchanged
        }

        // Put back for preview
        ctx.putImageData(imageData, 0, 0);
        return imageData;
    }

    /**
     * Gets the raw, un-thresholded ImageData from an Image object.
     * The printer class will apply the threshold during serialization.
     */
    static getOriginalImageData(img, targetWidth) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scaledHeight = Math.floor(img.height * (targetWidth / img.width));
        
        canvas.width = targetWidth;
        canvas.height = scaledHeight;
        ctx.drawImage(img, 0, 0, targetWidth, scaledHeight);
        
        return ctx.getImageData(0, 0, targetWidth, scaledHeight);
    }
}
