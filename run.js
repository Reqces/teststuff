(async () => {
const CONFIG = {
COOLDOWN_DEFAULT: 31000,
TRANSPARENCY_THRESHOLD: 100,
WHITE_THRESHOLD: 250,
LOG_INTERVAL: 10,
THEME: {
primary: '#000000',
secondary: '#111111',
accent: '#222222',
text: '#ffffff',
highlight: '#775ce3',
success: '#00ff00',
error: '#ff0000',
warning: '#ffaa00'
}
};

const TEXTS = {
// … (giữ nguyên các chuỗi tiếng Anh và tiếng Bồ Đào Nha)
};

const state = {
running: false,
imageLoaded: false,
processing: false,
totalPixels: 0,
paintedPixels: 0,
availableColors: [],
currentCharges: 0,
cooldown: CONFIG.COOLDOWN_DEFAULT,
imageData: null,
stopFlag: false,
colorsChecked: false,
startPosition: null,
selectingPosition: false,
region: null,
minimized: false,
lastPosition: { x: 0, y: 0 },
estimatedTime: 0,
language: 'en'
};

async function detectLanguage() {
try {
const response = await fetch('https://ipapi.co/json/');
const data = await response.json();
state.language = data.country === 'BR' ? 'pt' : 'en';
return state.language;
} catch {
state.language = 'en';
return 'en';
}
}

const Utils = {
sleep: ms => new Promise(r => setTimeout(r, ms)),
colorDistance: (a, b) => Math.sqrt(
Math.pow(a[0] - b[0], 2) +
Math.pow(a[1] - b[1], 2) +
Math.pow(a[2] - b[2], 2)
),
createImageUploader: () => new Promise(resolve => {
const input = document.createElement('input');
input.type = 'file';
input.accept = 'image/png,image/jpeg';
input.onchange = () => {
const fr = new FileReader();
fr.onload = () => resolve(fr.result);
fr.readAsDataURL(input.files[0]);
};
input.click();
}),
extractAvailableColors: () => {
const colorElements = document.querySelectorAll('[id^="color-"]');
return Array.from(colorElements)
.filter(el => !el.querySelector('svg'))
.filter(el => {
const id = parseInt(el.id.replace('color-', ''));
return id !== 0 && id !== 5;
})
.map(el => {
const id = parseInt(el.id.replace('color-', ''));
const rgbStr = el.style.backgroundColor.match(/\d+/g);
const rgb = rgbStr ? rgbStr.map(Number) : [0, 0, 0];
return { id, rgb };
});
},
formatTime: ms => {
const seconds = Math.floor((ms / 1000) % 60);
const minutes = Math.floor((ms / (1000 * 60)) % 60);
const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
const days = Math.floor(ms / (1000 * 60 * 60 * 24));
let result = '';
if (days > 0) result += ${days}d ;
if (hours > 0 || days > 0) result += ${hours}h ;
if (minutes > 0 || hours > 0 || days > 0) result += ${minutes}m ;
result += ${seconds}s;
return result;
},
showAlert: (message, type = 'info') => {
const alert = document.createElement('div');
alert.style.position = 'fixed';
alert.style.top = '20px';
alert.style.left = '50%';
alert.style.transform = 'translateX(-50%)';
alert.style.padding = '15px 20px';
alert.style.background = CONFIG.THEME[type] || CONFIG.THEME.accent;
alert.style.color = CONFIG.THEME.text;
alert.style.borderRadius = '5px';
alert.style.zIndex = '10000';
alert.style.boxShadow = '0 3px 10px rgba(0,0,0,0.3)';
alert.style.display = 'flex';
alert.style.alignItems = 'center';
alert.style.gap = '10px';
const icons = {
error: 'exclamation-circle',
success: 'check-circle',
warning: 'exclamation-triangle',
info: 'info-circle'
};
alert.innerHTML = <i class="fas fa-${icons[type] || 'info-circle'}"></i> <span>${message}</span>;
document.body.appendChild(alert);
setTimeout(() => {
alert.style.opacity = '0';
alert.style.transition = 'opacity 0.5s';
setTimeout(() => alert.remove(), 500);
}, 3000);
},
calculateEstimatedTime: (remainingPixels, currentCharges, cooldown) => {
const pixelsPerCharge = currentCharges > 0 ? currentCharges : 0;
const fullCycles = Math.ceil((remainingPixels - pixelsPerCharge) / Math.max(currentCharges, 1));
return (fullCycles * cooldown) + ((remainingPixels - 1) * 100);
},
isWhitePixel: (r, g, b) => {
return r >= CONFIG.WHITE_THRESHOLD &&
g >= CONFIG.WHITE_THRESHOLD &&
b >= CONFIG.WHITE_THRESHOLD;
},
t: (key, params = {}) => {
let text = TEXTS[state.language][key] || TEXTS.en[key] || key;
for (const [k, v] of Object.entries(params)) {
text = text.replace({${k}}, v);
}
return text;
}
};

const WPlaceService = {
async paintPixelInRegion(regionX, regionY, pixelX, pixelY, color) {
try {
const res = await fetch(https://backend.wplace.live/s0/pixel/${regionX}/${regionY}, {
method: 'POST',
headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
credentials: 'include',
body: JSON.stringify({ coords: [pixelX, pixelY], colors: [color] })
});
const data = await res.json();
return data?.painted === 1;
} catch {
return false;
}
},
async getCharges() {
try {
const res = await fetch('https://backend.wplace.live/me', {
credentials: 'include'
});
const data = await res.json();
return {
charges: data.charges?.count || 0,
cooldown: data.charges?.cooldownMs || CONFIG.COOLDOWN_DEFAULT
};
} catch {
return { charges: 0, cooldown: CONFIG.COOLDOWN_DEFAULT };
}
}
};

class ImageProcessor {
constructor(imageSrc) {
this.imageSrc = imageSrc;
this.img = new Image();
this.canvas = document.createElement('canvas');
this.ctx = this.canvas.getContext('2d');
this.previewCanvas = document.createElement('canvas');
this.previewCtx = this.previewCanvas.getContext('2d');
}
async load() {
return new Promise((resolve, reject) => {
this.img.onload = () => {
this.canvas.width = this.img.width;
this.canvas.height = this.img.height;
this.ctx.drawImage(this.img, 0, 0);
resolve();
};
this.img.onerror = reject;
this.img.src = this.imageSrc;
});
}
getPixelData() {
return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
}
getDimensions() {
return { width: this.canvas.width, height: this.canvas.height };
}
resize(newWidth, newHeight) {
const tempCanvas = document.createElement('canvas');
tempCanvas.width = newWidth;
tempCanvas.height = newHeight;
const tempCtx = tempCanvas.getContext('2d');
tempCtx.drawImage(this.img, 0, 0, newWidth, newHeight);
this.canvas.width = newWidth;
this.canvas.height = newHeight;
this.ctx.drawImage(tempCanvas, 0, 0);
return this.getPixelData();
}
generatePreview(newWidth, newHeight) {
this.previewCanvas.width = newWidth;
this.previewCanvas.height = newHeight;
this.previewCtx.imageSmoothingEnabled = false;
this.previewCtx.drawImage(this.img, 0, 0, newWidth, newHeight);
return this.previewCanvas.toDataURL();
}
}

function findClosestColor(rgb, palette) {
return palette.reduce((closest, current) => {
const currentDistance = Utils.colorDistance(rgb, current.rgb);
return currentDistance < closest.distance
? { color: current, distance: currentDistance }
: closest;
}, { color: palette[0], distance: Utils.colorDistance(rgb, palette[0].rgb) }).color.id;
}

async function createUI() {
await detectLanguage();
// (CSS styles & DOM creation code: giữ nguyên như bản gốc)
// … tạo giao diện …

// Liên kết các phần tử
const initBotBtn = container.querySelector('#initBotBtn');
const uploadBtn = container.querySelector('#uploadBtn');
const resizeBtn = container.querySelector('#resizeBtn');
const selectPosBtn = container.querySelector('#selectPosBtn');
const startBtn = container.querySelector('#startBtn');
const stopBtn = container.querySelector('#stopBtn');
// … (các tham chiếu khác) …

initBotBtn.addEventListener('click', async () => {
  try {
    updateUI('checkingColors', 'default');
    state.availableColors = Utils.extractAvailableColors();
    if (state.availableColors.length === 0) {
      Utils.showAlert(Utils.t('noColorsFound'), 'error');
      updateUI('noColorsFound', 'error');
      return;
    }
    state.colorsChecked = true;
    uploadBtn.disabled = false;
    selectPosBtn.disabled = false;
    initBotBtn.style.display = 'none';
    updateUI('colorsFound', 'success', { count: state.availableColors.length });
    updateStats();
  } catch {
    updateUI('imageError', 'error');
  }
});

uploadBtn.addEventListener('click', async () => {
  try {
    updateUI('loadingImage', 'default');
    const imageSrc = await Utils.createImageUploader();
    const processor = new ImageProcessor(imageSrc);
    await processor.load();
    const { width, height } = processor.getDimensions();
    const pixels = processor.getPixelData();
    let totalValidPixels = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const alpha = pixels[idx + 3];
        if (alpha < CONFIG.TRANSPARENCY_THRESHOLD) continue;
        if (Utils.isWhitePixel(r, g, b)) continue;
        totalValidPixels++;
      }
    }
    state.imageData = {
      width,
      height,
      pixels,
      totalPixels: totalValidPixels,
      processor
    };
    state.totalPixels = totalValidPixels;
    state.paintedPixels = 0;
    state.imageLoaded = true;
    state.lastPosition = { x: 0, y: 0 };
    resizeBtn.disabled = false;
    if (state.startPosition) {
      startBtn.disabled = false;
    }
    updateStats();
    updateUI('imageLoaded', 'success', { count: totalValidPixels });
  } catch {
    updateUI('imageError', 'error');
  }
});

selectPosBtn.addEventListener('click', async () => {
  if (state.selectingPosition) return;
  state.selectingPosition = true;
  state.startPosition = null;
  state.region = null;
  startBtn.disabled = true;
  Utils.showAlert(Utils.t('selectPositionAlert'), 'info');
  updateUI('waitingPosition', 'default');
  const originalFetch = window.fetch;
  window.fetch = async (url, options) => {
    if (typeof url === 'string' && 
        url.includes('https://backend.wplace.live/s0/pixel/') && 
        options?.method?.toUpperCase() === 'POST') {
      try {
        const response = await originalFetch(url, options);
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        if (data?.painted === 1) {
          const regionMatch = url.match(/\/pixel\/(\d+)\/(\d+)/);
          if (regionMatch && regionMatch.length >= 3) {
            state.region = {
              x: parseInt(regionMatch[1]),
              y: parseInt(regionMatch[2])
            };
          }
          const payload = JSON.parse(options.body);
          if (payload?.coords && Array.isArray(payload.coords)) {
            state.startPosition = {
              x: payload.coords[0],
              y: payload.coords[1]
            };
            state.lastPosition = { x: 0, y: 0 };
            if (state.imageLoaded) {
              startBtn.disabled = false;
            }
            window.fetch = originalFetch;
            state.selectingPosition = false;
            updateUI('positionSet', 'success');
          }
        }
        return response;
      } catch {
        return originalFetch(url, options);
      }
    }
    return originalFetch(url, options);
  };
  setTimeout(() => {
    if (state.selectingPosition) {
      window.fetch = originalFetch;
      state.selectingPosition = false;
      updateUI('positionTimeout', 'error');
      Utils.showAlert(Utils.t('positionTimeout'), 'error');
    }
  }, 120000);
});

// === ĐIỂM CHỈNH SỬA CHÍNH ===
startBtn.addEventListener('click', async () => {
  if (!state.imageLoaded || !state.startPosition || !state.region) {
    updateUI('missingRequirements', 'error');
    return;
  }
  // Lấy lại số charges và cooldown ngay trước khi vẽ
  try {
    const { charges: freshCharges, cooldown: freshCooldown } = await WPlaceService.getCharges();
    state.currentCharges = Math.floor(freshCharges);
    state.cooldown = freshCooldown;
  } catch {
    // Nếu không lấy được, giữ nguyên giá trị hiện tại
  }
  state.running = true;
  state.stopFlag = false;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  uploadBtn.disabled = true;
  selectPosBtn.disabled = true;
  resizeBtn.disabled = true;
  updateUI('startPaintingMsg', 'success');
  try {
    await processImage();
  } catch {
    updateUI('paintingError', 'error');
  } finally {
    state.running = false;
    stopBtn.disabled = true;
    if (!state.stopFlag) {
      startBtn.disabled = true;
      uploadBtn.disabled = false;
      selectPosBtn.disabled = false;
      resizeBtn.disabled = false;
    } else {
      startBtn.disabled = false;
    }
  }
});

stopBtn.addEventListener('click', () => {
  state.stopFlag = true;
  state.running = false;
  stopBtn.disabled = true;
  updateUI('paintingStopped', 'warning');
});
}

async function processImage() {
const { width, height, pixels } = state.imageData;
const { x: startX, y: startY } = state.startPosition;
const { x: regionX, y: regionY } = state.region;
let startRow = state.lastPosition.y || 0;
let startCol = state.lastPosition.x || 0;
outerLoop:
for (let y = startRow; y < height; y++) {
for (let x = (y === startRow ? startCol : 0); x < width; x++) {
if (state.stopFlag) {
state.lastPosition = { x, y };
updateUI('paintingPaused', 'warning', { x, y });
break outerLoop;
}
const idx = (y * width + x) * 4;
const r = pixels[idx];
const g = pixels[idx + 1];
const b = pixels[idx + 2];
const alpha = pixels[idx + 3];
if (alpha < CONFIG.TRANSPARENCY_THRESHOLD) continue;
if (Utils.isWhitePixel(r, g, b)) continue;
const rgb = [r, g, b];
const colorId = findClosestColor(rgb, state.availableColors);
if (state.currentCharges < 1) {
updateUI('noCharges', 'warning', { time: Utils.formatTime(state.cooldown) });
await Utils.sleep(state.cooldown);
const chargeUpdate = await WPlaceService.getCharges();
state.currentCharges = chargeUpdate.charges;
state.cooldown = chargeUpdate.cooldown;
}
const pixelX = startX + x;
const pixelY = startY + y;
const success = await WPlaceService.paintPixelInRegion(
regionX,
regionY,
pixelX,
pixelY,
colorId
);
if (success) {
state.paintedPixels++;
state.currentCharges--;
state.estimatedTime = Utils.calculateEstimatedTime(
state.totalPixels - state.paintedPixels,
state.currentCharges,
state.cooldown
);
if (state.paintedPixels % CONFIG.LOG_INTERVAL === 0) {
updateStats();
updateUI('paintingProgress', 'default', {
painted: state.paintedPixels,
total: state.totalPixels
});
}
}
}
}
if (state.stopFlag) {
updateUI('paintingStopped', 'warning');
} else {
updateUI('paintingComplete', 'success', { count: state.paintedPixels });
state.lastPosition = { x: 0, y: 0 };
}
updateStats();
}

createUI();
})();