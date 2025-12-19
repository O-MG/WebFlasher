import ESPFlasher, { WifiConfig, FlashProgress, setDebugMode, debugMode } from './flashUtils';
import './ui.js';
import './cacheManager.js';
import './wizard.js';
import './styles/main.css';

let flashMap: any = null;

(window as any).setDebugMode = setDebugMode;
(window as any).getDebugMode = () => debugMode;

let baseUrl = 'https://raw.githubusercontent.com/O-MG/O.MG-Firmware';
let selectedBranch = 'stable';

const RELEASES_URL = 'https://api.github.com/repos/O-MG/O.MG-Firmware/releases?per_page=100';
const BRANCHES_URL = 'https://api.github.com/repos/O-MG/O.MG-Firmware/branches';

async function loadMemoryMap() {
  try {
    if ((window as any).cacheManager) {
      flashMap = await (window as any).cacheManager.fetchWithCache('./assets/memmap.json', 'json');
    } else {
      const response = await fetch('./assets/memmap.json');
      if (!response.ok) {
        throw new Error(`Failed to load memory map: ${response.status}`);
      }
      flashMap = await response.json();
    }
    ErrorHandler.logInfo('Memory map loaded successfully');
  } catch (error) {
    ErrorHandler.logError(`Failed to load memory map: ${error}`);
    throw error;
  }
}

async function getFirmwareReleases() {
  try {
    let rawReleases;

    // Use cache manager if available
    if ((window as any).cacheManager) {
      rawReleases = await (window as any).cacheManager.fetchWithCache(RELEASES_URL, 'json');
    } else {
      const response = await fetch(RELEASES_URL);
      if (!response.ok) {
        throw new Error('Failed to load firmware releases');
      }
      rawReleases = await response.json();
    }

    // Check for error response
    if (rawReleases.message) {
      ErrorHandler.logError('Invalid data, cannot load current releases list');
      return {};
    }

    const releases: any = {};

    for (let i = 0; i < rawReleases.length; i++) {
      const element = rawReleases[i];

      if (element.target_commitish && !releases[element.target_commitish]) {
        if (element.draft === false) {
          releases[element.target_commitish] = {
            name: element.name || element.tag_name,
            tag_name: element.tag_name,
            version: element.tag_name,
            author: element.author?.login,
            target_commitish: element.target_commitish
          };
        }
      }
    }

    return releases;
  } catch (error) {
    ErrorHandler.logError('Failed to fetch firmware releases', error);
    return {};
  }
}

async function loadFirmwareReleases() {
  try {
    let releases = await getFirmwareReleases();

    const skippedReleases = ['legacy-v1.5', 'legacy-v2.0'];

    for (const availableRelease in releases) {
      for (const skippedRelease of skippedReleases) {
        if (availableRelease.includes(skippedRelease)) {
          delete releases[availableRelease];
        }
      }
    }

    const firmwareBuildSelect = document.getElementById('firmwareBuild') as HTMLSelectElement;
    if (firmwareBuildSelect) {
      firmwareBuildSelect.innerHTML = '';

      const defaultReleases = ['stable', 'legacy-2.5', 'beta'];
      let noDefault = true;

      for (let i = 0; i < defaultReleases.length; i++) {
        const key = defaultReleases[i];
        if (releases[key]) {
          let displayName = releases[key].name;

          if (noDefault) {
            displayName = displayName + ' (Default)';
            noDefault = false;
          }

          const option = new Option(displayName, key, !noDefault, !noDefault);
          firmwareBuildSelect.add(option);
          delete releases[key];
        }
      }

      for (const branch in releases) {
        const details = releases[branch];
        firmwareBuildSelect.add(new Option(details.name, branch, false, false));
      }

      ErrorHandler.logInfo('Firmware releases loaded');
    }
  } catch (error) {
    ErrorHandler.logWarning(`Could not load firmware releases: ${error}`);
  }
}

function sanitizeText(text: string): string {
  return text
    .replace(/[✓✅]/g, '[OK]')
    .replace(/[✗❌]/g, '[ERROR]')
    .replace(/[⚠️]/g, '[WARNING]')
    .replace(/[ℹ️]/g, '[INFO]')
    .replace(/[━]/g, '-')
    .replace(/[▼]/g, 'v')
    .replace(/[▲]/g, '^')
    .replace(/[→]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[⌘]/g, '[CMD]')
    .replace(/[⚙]/g, '[SETTINGS]')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFE30-\uFE4F]/g, ' ') // Various unicode spaces and punctuation
    .replace(/[^\x00-\x7F]/g, '?'); // Replace any remaining non-ASCII with ?
}

class ErrorHandler {
  static showFatalError(message: string, details?: string) {
    const modal = document.getElementById('fatalErrorModal');
    const messageEl = document.getElementById('fatalErrorMessage');
    const detailsEl = document.getElementById('fatalErrorDetails');
    
    if (messageEl && detailsEl) {
      messageEl.querySelector('p')!.textContent = sanitizeText(message);
      detailsEl.textContent = sanitizeText(details || 'No additional details available.');
    }
    
    if (modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(modal);
      bootstrapModal.show();
    }
    
    terminal.writeLine(`[FATAL ERROR] ${sanitizeText(message)}`);
    if (details) {
      terminal.writeLine(`[FATAL ERROR DETAILS] ${sanitizeText(details)}`);
    }
  }
  
  static logError(message: string, error?: any) {
    const errorMsg = error ? `${message}: ${error.toString()}` : message;
    terminal.writeLine(`[ERROR] ${sanitizeText(errorMsg)}`);
  }
  
  static logWarning(message: string) {
    terminal.writeLine(`[WARNING] ${sanitizeText(message)}`);
  }
  
  static logInfo(message: string) {
    terminal.writeLine(`[INFO] ${sanitizeText(message)}`);
  }
}

const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

console.log = (...args) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  terminal.writeLine(`[LOG] ${sanitizeText(message)}`);
  originalConsole.log(...args);
};

console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  ErrorHandler.logError(message);
  originalConsole.error(...args);
};

console.warn = (...args) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  ErrorHandler.logWarning(message);
  originalConsole.warn(...args);
};

console.info = (...args) => {
  const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
  ErrorHandler.logInfo(message);
  originalConsole.info(...args);
};

const terminal = {
  clean() {
    const consoleTerminal = document.getElementById('consoleTerminal');
    if (consoleTerminal) consoleTerminal.innerHTML = '';
  },
  writeLine(data: string) {
    const consoleTerminal = document.getElementById('consoleTerminal');
    const autoScroll = (document.getElementById('autoScroll') as HTMLInputElement)?.checked ?? true;
    
    const sanitizedData = sanitizeText(data);
    
    if (consoleTerminal) {
      const line = document.createElement('div');
      line.textContent = sanitizedData;
      consoleTerminal.appendChild(line);
      if (autoScroll) {
        consoleTerminal.scrollTop = consoleTerminal.scrollHeight;
      }
    }
  },
  write(data: string) {
    const consoleTerminal = document.getElementById('consoleTerminal');
    const autoScroll = (document.getElementById('autoScroll') as HTMLInputElement)?.checked ?? true;
    
    const sanitizedData = sanitizeText(data);
    
    if (consoleTerminal) {
      if (sanitizedData.includes('\r')) {
        const lines = consoleTerminal.children;
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1] as HTMLElement;
          const parts = sanitizedData.split('\r');
          lastLine.textContent = parts[parts.length - 1];
        } else {
          const line = document.createElement('div');
          line.textContent = sanitizedData.replace(/\r/g, '');
          consoleTerminal.appendChild(line);
        }
      } else if (sanitizedData.includes('\n')) {
        const parts = sanitizedData.split('\n');
        for (let i = 0; i < parts.length; i++) {
          if (i === 0 && consoleTerminal.children.length > 0) {
            const lastLine = consoleTerminal.children[consoleTerminal.children.length - 1] as HTMLElement;
            lastLine.textContent += parts[i];
          } else if (parts[i] || i < parts.length - 1) {
            const line = document.createElement('div');
            line.textContent = parts[i];
            consoleTerminal.appendChild(line);
          }
        }
      } else {
        if (consoleTerminal.children.length > 0) {
          const lastLine = consoleTerminal.children[consoleTerminal.children.length - 1] as HTMLElement;
          lastLine.textContent += sanitizedData;
        } else {
          const line = document.createElement('div');
          line.textContent = sanitizedData;
          consoleTerminal.appendChild(line);
        }
      }
      
      if (autoScroll) {
        consoleTerminal.scrollTop = consoleTerminal.scrollHeight;
      }
    }
  }
};

let flasher: ESPFlasher | null = null;
let detectedFlashSize: '1024' | '2048' = '1024';

(window as any).getFlasher = () => flasher;
(window as any).setFlasher = (f: ESPFlasher | null) => { flasher = f; };
(window as any).getDetectedFlashSize = () => detectedFlashSize;
(window as any).setDetectedFlashSize = (size: '1024' | '2048') => { detectedFlashSize = size; };
(window as any).ESPFlasher = ESPFlasher;
(window as any).terminal = terminal;
(window as any).getFlashMap = () => flashMap;
(window as any).loadMemoryMap = loadMemoryMap;
(window as any).getFirmwareReleases = getFirmwareReleases;
(window as any).baseUrl = baseUrl;
(window as any).selectedBranch = selectedBranch;
(window as any).ErrorHandler = ErrorHandler;

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const flashBtn = document.getElementById('flashBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;

declare function setStepCompleted(stepId: string): void;
declare function setStepActive(stepId: string): void;

function showTerminal() {
  const consoleModal = document.getElementById('consoleModal');
  if (consoleModal) {
    const bootstrapModal = new (window as any).bootstrap.Modal(consoleModal);
    bootstrapModal.show();
  }
}

connectBtn?.addEventListener('click', async () => {
  try {
    ErrorHandler.logInfo('Connecting to device...');
    
    if (!flashMap) {
      ErrorHandler.logInfo('Loading memory map...');
      await loadMemoryMap();
    }
    
    const branchName = selectedBranch.includes('branch-') ? selectedBranch.split('-')[1] : selectedBranch;
    const fullBaseUrl = `${baseUrl}/${branchName}/firmware`;
    
    flasher = new ESPFlasher(terminal, flashMap, fullBaseUrl);
    await flasher.connect();
    
    try {
      const size = await flasher.getFlashSize();
      if (size === '1024' || size === '2048') {
        detectedFlashSize = size;
      } else {
        detectedFlashSize = '1024';
      }
      ErrorHandler.logInfo(`Detected ${detectedFlashSize/1024}MB flash size and will use it for flashing`);
    } catch (error) {
      detectedFlashSize = '1024';
      ErrorHandler.logWarning('Flash size detection failed, defaulting to 1MB');
    }
    
    connectBtn.disabled = true;
    flashBtn.disabled = false;
    if (disconnectBtn) disconnectBtn.disabled = false;
    
    setStepCompleted('step2');
    setStepActive('step2-flash');
    
    ErrorHandler.logInfo('Connected successfully! Ready to flash.');
  } catch (error) {
    ErrorHandler.showFatalError('Failed to connect to device', error?.toString());
  }
});

flashBtn?.addEventListener('click', async () => {
  if (!flasher) {
    ErrorHandler.logError('Not connected to a device');
    return;
  }

  try {
    flashBtn.disabled = true;
    flashBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Programming...';
    
    const flashSize = detectedFlashSize;
    ErrorHandler.logInfo(`Starting flash process with ${flashSize}KB flash size (auto-detected)`);
    
    let wifiConfig: WifiConfig | undefined;
    const customizeWifi = (document.getElementById('customizeWifi') as HTMLInputElement)?.checked;
    if (customizeWifi) {
      const ssid = (document.getElementById('ssidName') as HTMLInputElement)?.value || 'O.MG';
      const password = (document.getElementById('wifiPassword') as HTMLInputElement)?.value || '12345678';
      const wifiModeValue = (document.querySelector('input[name="wifiMode"]:checked') as HTMLInputElement)?.value || 'ap';
      wifiConfig = {
        ssid,
        password,
        mode: wifiModeValue === 'station' ? 'station' : 'ap'
      };
      ErrorHandler.logInfo(`WiFi Config: SSID=${ssid}, Mode=${wifiModeValue}`);
    }
    
    const progressContainer = document.getElementById('flashProgressContainer') as HTMLElement;
    const progressBar = document.getElementById('flashProgressBar') as HTMLElement;
    const progressLabel = document.getElementById('flashProgressLabel') as HTMLElement;
    const progressPercent = document.getElementById('flashProgressPercent') as HTMLElement;
    
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
    
    const onProgress = (progress: FlashProgress) => {
      if (progressBar) {
        progressBar.style.width = `${progress.percent}%`;
        progressBar.setAttribute('aria-valuenow', progress.percent.toString());
      }
      if (progressPercent) {
        progressPercent.textContent = `${progress.percent}%`;
      }
      if (progress.phase === 'loading') {
        flashBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        if (progressLabel) progressLabel.textContent = 'Loading firmware files...';
      } else if (progress.phase === 'patching') {
        flashBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Patching...';
        if (progressLabel) progressLabel.textContent = 'Patching firmware...';
      } else if (progress.phase === 'flashing') {
        flashBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Flashing ${progress.percent}%`;
        if (progressLabel) progressLabel.textContent = progress.message || 'Writing to device...';
      } else if (progress.phase === 'complete') {
        flashBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Complete!';
        if (progressLabel) progressLabel.textContent = 'Flash complete!';
        if (progressBar) progressBar.classList.remove('progress-bar-animated');
      }
    };
    
    await flasher.flash(flashSize, wifiConfig, onProgress);

    setStepCompleted('step2-flash');
    ErrorHandler.logInfo('Flash completed successfully!');
    
    showFlashResultCard(true, wifiConfig);
    
    setTimeout(() => {
      flashBtn.innerHTML = 'Program';
    }, 2000);
  } catch (error) {
    ErrorHandler.showFatalError('Flash process failed', error?.toString());
    flashBtn.innerHTML = 'Program';
    flashBtn.disabled = false;
    
    const progressBarErr = document.getElementById('flashProgressBar') as HTMLElement;
    const progressLabelErr = document.getElementById('flashProgressLabel') as HTMLElement;
    if (progressBarErr) {
      progressBarErr.style.width = '0%';
      progressBarErr.classList.add('bg-danger');
    }
    if (progressLabelErr) {
      progressLabelErr.textContent = 'Flash failed!';
    }
    
    showFlashResultCard(false, undefined, error?.toString());
  }
});

function showFlashResultCard(success: boolean, wifiConfig?: WifiConfig, errorMessage?: string) {
  const step3 = document.getElementById('step3') as HTMLElement;
  const resultHeader = document.getElementById('flashResultHeader') as HTMLElement;
  const resultIcon = document.getElementById('flashResultIcon') as HTMLElement;
  const resultTitle = document.getElementById('flashResultTitle') as HTMLElement;
  const resultMessage = document.getElementById('flashResultMessage') as HTMLElement;
  const wifiInfo = document.getElementById('flashResultWifiInfo') as HTMLElement;
  const wifiMode = document.getElementById('flashResultWifiMode') as HTMLElement;
  const wifiSSID = document.getElementById('flashResultWifiSSID') as HTMLElement;
  const wifiPassword = document.getElementById('flashResultWifiPassword') as HTMLElement;

  if (!step3) return;

  step3.style.display = 'block';
  if (success) {
    step3.classList.add('completed');
  }
  
  if (success) {
    resultHeader.className = 'card-header d-flex align-items-center bg-success text-white';
    resultIcon.className = 'bi bi-check-circle-fill me-2';
    resultTitle.textContent = 'Flash Successful!';
    resultMessage.textContent = 'Your O.MG device has been successfully flashed with the new firmware.';
    
    if (wifiConfig && wifiInfo) {
      wifiInfo.style.display = 'block';
      if (wifiMode) wifiMode.textContent = wifiConfig.mode === 'ap' ? 'Access Point (AP)' : 'Station (Client)';
      if (wifiSSID) wifiSSID.textContent = wifiConfig.ssid;
      if (wifiPassword) wifiPassword.textContent = wifiConfig.password;
    } else if (wifiInfo) {
      wifiInfo.style.display = 'block';
      if (wifiMode) wifiMode.textContent = 'Access Point (AP) - Default';
      if (wifiSSID) wifiSSID.textContent = 'O.MG';
      if (wifiPassword) wifiPassword.textContent = '12345678';
    }
  } else {
    resultHeader.className = 'card-header d-flex align-items-center bg-danger text-white';
    resultIcon.className = 'bi bi-x-circle-fill me-2';
    resultTitle.textContent = 'Flash Failed';
    resultMessage.textContent = errorMessage || 'An error occurred during the flash process. Please check the terminal for details.';
    
    // Hide WiFi info on failure
    if (wifiInfo) wifiInfo.style.display = 'none';
  }
}

disconnectBtn?.addEventListener('click', async () => {
  if (flasher) {
    try {
      await flasher.disconnect();
      ErrorHandler.logInfo('Disconnected from device.');
    } catch (error) {
      ErrorHandler.logError('Error disconnecting', error);
    } finally {
      flasher = null;
      connectBtn.disabled = false;
      flashBtn.disabled = true;
      if (disconnectBtn) disconnectBtn.disabled = true;

      const step2 = document.getElementById('step2');
      const step2Flash = document.getElementById('step2-flash');
      const step3 = document.getElementById('step3');
      if (step2) {
        step2.classList.remove('completed');
        step2.classList.add('active');
      }
      if (step2Flash) {
        step2Flash.classList.remove('completed', 'active');
      }
      if (step3) {
        step3.style.display = 'none';
        step3.classList.remove('completed', 'active');
      }
    }
  }
});

// Cache management
function updateCacheStats() {
  if ((window as any).cacheManager) {
    const stats = (window as any).cacheManager.getStats();
    const itemCount = document.getElementById('cacheItemCount');
    const cacheSize = document.getElementById('cacheSize');
    const jsonCount = document.getElementById('cacheJsonCount');
    const binaryCount = document.getElementById('cacheBinaryCount');
    
    if (itemCount) itemCount.textContent = stats.totalItems.toString();
    if (cacheSize) cacheSize.textContent = stats.totalSizeFormatted;
    if (jsonCount) jsonCount.textContent = stats.jsonCount.toString();
    if (binaryCount) binaryCount.textContent = stats.binaryCount.toString();
  }
}

const settingsModal = document.getElementById('settingsModal');
if (settingsModal) {
  settingsModal.addEventListener('show.bs.modal', () => {
    updateCacheStats();
  });
}

const clearCacheBtn = document.getElementById('clearCacheBtn');
clearCacheBtn?.addEventListener('click', () => {
  if ((window as any).cacheManager) {
    if (confirm('Are you sure you want to clear all cached firmware files? They will be re-downloaded when needed.')) {
      (window as any).cacheManager.clearAll();
      updateCacheStats();
      ErrorHandler.logInfo('Cache cleared successfully');
    }
  }
});

if ((window as any).cacheManager) {
  (window as any).cacheManager.preloadJSON([
    './assets/memmap.json',
    './assets/wizard.json',
    RELEASES_URL
  ]).catch((error: any) => {
    console.error('Error pre-loading JSON files:', error);
  });
}

// Initialize the UI
ErrorHandler.logInfo('Ready to flash ESP device.');
Promise.all([
  loadMemoryMap(),
  loadFirmwareReleases()
]).catch(err => {
  ErrorHandler.logWarning('Could not load all resources. Some features may be limited.');
});

const firmwareBuildSelect = document.getElementById('firmwareBuild') as HTMLSelectElement;
firmwareBuildSelect?.addEventListener('change', () => {
  selectedBranch = firmwareBuildSelect.value;
  ErrorHandler.logInfo(`Selected firmware: ${firmwareBuildSelect.options[firmwareBuildSelect.selectedIndex].text}`);
});
