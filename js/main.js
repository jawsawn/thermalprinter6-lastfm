import { SerialConnection } from './connections/serial.js';
import { BluetoothConnection } from './connections/bluetooth.js';
import { ImageProcessor } from './image-processor.js';
import { Printer } from './printer.js';

// --- UI Elements ---
const btnConnectSerial = document.getElementById('btnConnectSerial');
const btnConnectBluetooth = document.getElementById('btnConnectBluetooth');
const btnDisconnect = document.getElementById('btnDisconnect');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const logTerminal = document.getElementById('logTerminal');
const btnClearLog = document.getElementById('btnClearLog');

const tabLinks = document.querySelectorAll('.tab-link');
const tabContents = document.querySelectorAll('.tab-content');

const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const contrastSlider = document.getElementById('contrastSlider');
const contrastValue = document.getElementById('contrastValue');
const ditherToggle = document.getElementById('ditherToggle');
const btnPrintImage = document.getElementById('btnPrintImage');
const previewCanvas = document.getElementById('previewCanvas');
const emptyPreview = document.getElementById('emptyPreview');

const textInputArea = document.getElementById('textInputArea');
const btnGenerateText = document.getElementById('btnGenerateText');

// --- State ---
let activeConnection = null;
let currentImage = null; // The loaded HTMLImageElement
const PRINTER_WIDTH = 384;

// --- Logger ---
function log(msg) {
    console.log(msg);
    const time = new Date().toLocaleTimeString();
    logTerminal.textContent += `\n[${time}] ${msg}`;
    logTerminal.scrollTop = logTerminal.scrollHeight;
}

btnClearLog.addEventListener('click', () => {
    logTerminal.textContent = 'Log cleared.';
});

// --- Tab Switching ---
tabLinks.forEach(link => {
    link.addEventListener('click', () => {
        tabLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        link.classList.add('active');
        document.getElementById(link.dataset.tab).classList.add('active');
    });
});

// --- Connection Handlers ---
function setUIConnected(isConnected) {
    btnConnectSerial.disabled = isConnected;
    btnConnectBluetooth.disabled = isConnected;
    btnDisconnect.disabled = !isConnected;
    
    fileInput.disabled = !isConnected;
    textInputArea.disabled = !isConnected;
    btnGenerateText.disabled = !isConnected;
    
    // We only enable printing/sliders if there is also an image loaded
    const canPrint = isConnected && currentImage !== null;
    contrastSlider.disabled = !canPrint;
    ditherToggle.disabled = !canPrint;
    btnPrintImage.disabled = !canPrint;

    if (isConnected) {
        statusDot.classList.add('connected');
        statusDot.classList.remove('error');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusDot.classList.remove('error');
        statusText.textContent = 'Disconnected';
        activeConnection = null;
    }
}

async function connect(type) {
    try {
        log(`Initializing ${type} connection...`);
        if (type === 'serial') {
            activeConnection = new SerialConnection(9600);
        } else {
            activeConnection = new BluetoothConnection();
        }

        activeConnection.onDisconnect(() => {
            log('Device disconnected gracefully or unexpectedly.');
            setUIConnected(false);
        });

        await activeConnection.connect();
        log('Successfully connected to printer.');
        setUIConnected(true);
    } catch (err) {
        log(`Connection failed: ${err.message}`);
        statusDot.classList.add('error');
        statusText.textContent = 'Error';
        activeConnection = null;
    }
}

btnConnectSerial.addEventListener('click', () => connect('serial'));
btnConnectBluetooth.addEventListener('click', () => connect('bluetooth'));

btnDisconnect.addEventListener('click', async () => {
    if (activeConnection) {
        log('Disconnecting...');
        await activeConnection.disconnect();
        setUIConnected(false);
    }
});

// --- Image Handling ---
function updatePreview() {
    if (!currentImage) return;
    emptyPreview.style.display = 'none';
    const threshold = parseInt(contrastSlider.value);
    const dither = ditherToggle.checked;
    ImageProcessor.processForPreview(previewCanvas, currentImage, PRINTER_WIDTH, threshold, dither);
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileName.textContent = file.name;
    log(`Loaded file: ${file.name}`);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        currentImage = img;
        URL.revokeObjectURL(url);
        updatePreview();
        setUIConnected(activeConnection !== null); // Refresh print button state
    };
    img.onerror = () => {
        log('Error loading image.');
        URL.revokeObjectURL(url);
    };
    img.src = url;
});

contrastSlider.addEventListener('input', () => {
    contrastValue.textContent = contrastSlider.value;
    updatePreview();
});

ditherToggle.addEventListener('change', () => {
    updatePreview();
});

// --- Text Handling ---
btnGenerateText.addEventListener('click', async () => {
    const text = textInputArea.value.trim();
    if (!text) {
        log('No text provided.');
        return;
    }

    try {
        log('Rendering text to image format...');
        btnGenerateText.disabled = true;
        
        currentImage = await ImageProcessor.generateImageFromText(text, PRINTER_WIDTH);
        
        log('Text rendered. Switching to Image tab to preview/print.');
        
        // Auto-switch to image tab
        document.querySelector('[data-tab="imageTab"]').click();
        
        fileName.textContent = 'Generated Text Image';
        updatePreview();
        setUIConnected(activeConnection !== null);
        
    } catch (err) {
        log(`Render error: ${err.message}`);
    } finally {
        btnGenerateText.disabled = false;
    }
});

// --- Printing ---
btnPrintImage.addEventListener('click', async () => {
    if (!activeConnection) {
        log('Error: Printer not connected.');
        return;
    }
    if (!currentImage) {
        log('Error: No image loaded.');
        return;
    }

    try {
        btnPrintImage.disabled = true;
        
        // Get the un-thresholded original image data scaled to printer width
        const rawImageData = ImageProcessor.getOriginalImageData(currentImage, PRINTER_WIDTH);
        const threshold = parseInt(contrastSlider.value);
        const dither = ditherToggle.checked;

        // If dithering, pre-process the data before sending to printer
        if (dither) {
            ImageProcessor.applyDither(rawImageData, threshold);
        }
        
        const printer = new Printer(activeConnection);
        
        await printer.printImage(rawImageData, threshold, (msg) => log(msg));
        
    } catch (err) {
        log(`Print error: ${err.message}`);
    } finally {
        btnPrintImage.disabled = false;
    }
});
