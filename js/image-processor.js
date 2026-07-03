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
     * Draws an image to a canvas, applies B&W conversion, and returns the ImageData.
     * Supports both hard threshold and Floyd-Steinberg dithering.
     * @param {HTMLCanvasElement} canvas - The preview canvas
     * @param {HTMLImageElement} img - The source image
     * @param {number} printerWidth - Target width
     * @param {number} contrastThreshold - Threshold for B&W
     * @param {boolean} dither - If true, use Floyd-Steinberg dithering
     * @param {number} ditherContrast - Contrast adjustment for dithering (-255 to 255)
     * @returns {ImageData} - The processed image data
     */
    static processForPreview(canvas, img, printerWidth, contrastThreshold, dither = false, ditherContrast = 0) {
        if (!img) return null;

        const ctx = canvas.getContext('2d');
        const scaledHeight = Math.floor(img.height * (printerWidth / img.width));

        canvas.width = printerWidth;
        canvas.height = scaledHeight;

        // Fill white first so transparent pixels become white (no print)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, printerWidth, scaledHeight);

        // Draw original on top of white background
        ctx.drawImage(img, 0, 0, printerWidth, scaledHeight);

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, printerWidth, scaledHeight);

        if (dither) {
            this._floydSteinberg(imageData, printerWidth, scaledHeight, contrastThreshold, ditherContrast);
        } else {
            this._hardThreshold(imageData, contrastThreshold);
        }

        // Put back for preview
        ctx.putImageData(imageData, 0, 0);
        return imageData;
    }

    /**
     * Simple hard threshold: pixels below threshold become black, above become white.
     */
    static _hardThreshold(imageData, contrastThreshold) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const average = (0.2126 * r + 0.7152 * g + 0.0722 * b);
            const bw = average < contrastThreshold ? 0 : 255;
            data[i] = bw;
            data[i + 1] = bw;
            data[i + 2] = bw;
        }
    }

    /**
     * Floyd-Steinberg dithering: distributes quantization error to neighboring pixels
     * for much better image quality on thermal printers.
     * Includes contrast adjustment before dithering.
     */
    static _floydSteinberg(imageData, width, height, threshold, contrast = 0) {
        const data = imageData.data;
        
        // Calculate contrast factor
        // factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        // Build a grayscale float buffer for error diffusion
        const gray = new Float32Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const idx = i * 4;
            let grayscale = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
            
            // Apply contrast
            grayscale = factor * (grayscale - 128) + 128;
            if (grayscale < 0) grayscale = 0;
            if (grayscale > 255) grayscale = 255;
            
            gray[i] = grayscale;
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const oldPixel = gray[i];
                const newPixel = oldPixel < threshold ? 0 : 255;
                gray[i] = newPixel;
                const error = oldPixel - newPixel;

                // Distribute error to neighbors (Floyd-Steinberg coefficients)
                if (x + 1 < width)                     gray[i + 1]         += error * 7 / 16;
                if (y + 1 < height && x - 1 >= 0)      gray[i + width - 1] += error * 3 / 16;
                if (y + 1 < height)                     gray[i + width]     += error * 5 / 16;
                if (y + 1 < height && x + 1 < width)   gray[i + width + 1] += error * 1 / 16;
            }
        }

        // Write back to ImageData
        for (let i = 0; i < gray.length; i++) {
            const bw = gray[i] < 128 ? 0 : 255;
            const idx = i * 4;
            data[idx] = bw;
            data[idx + 1] = bw;
            data[idx + 2] = bw;
        }
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

        // Fill white first so transparent pixels become white (no print)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, scaledHeight);

        ctx.drawImage(img, 0, 0, targetWidth, scaledHeight);
        
        return ctx.getImageData(0, 0, targetWidth, scaledHeight);
    }

    /**
     * Applies Floyd-Steinberg dithering to ImageData in-place.
     * Used by the print path to pre-process the data before sending to printer.
     * After this, the printer's threshold is effectively bypassed since
     * pixels are already 0 or 255.
     */
    static applyDither(imageData, threshold, contrast = 0) {
        this._floydSteinberg(imageData, imageData.width, imageData.height, threshold, contrast);
    }
}
