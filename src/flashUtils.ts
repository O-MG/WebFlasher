import { ESPLoader, Transport } from 'esptool-js';

export let debugMode = false;

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

declare global {
  interface Navigator {
    serial: SerialPort;
  }
}

interface SerialPort {
  requestPort(): Promise<any>;
}

interface FlashFile {
  name: string;
  offset: string;
  type: 'file' | 'blank';
  url?: string;
}

type FlashMap = {
  [key: string]: FlashFile[];
};

export interface DeviceInfo {
  valid: boolean;
  magic_code?: number;
  prod_type?: string;
  flash_size?: number;
  device_id?: string;
  fwver?: string;
  branch?: string;
  commit?: number;
  firmware_checksum?: number;
  ofat_ver?: number;
  ofat_filespace_size?: number;
  ofat_freespace?: number;
  pagempfs_size?: number;
}

export interface WifiConfig {
  ssid: string;
  password: string;
  mode: 'ap' | 'station'; // ap = Access Point (soft_ap), station = connect to existing network
}

export interface FlashProgress {
  phase: 'loading' | 'patching' | 'flashing' | 'complete';
  percent: number;
  message: string;
}

export type ProgressCallback = (progress: FlashProgress) => void;

export class ESPFlasher {
  private espLoader: ESPLoader | null = null;
  private terminal: {
    clean: () => void;
    writeLine: (data: string) => void;
    write: (data: string) => void;
  };
  private flashMap: FlashMap;
  private baseUrl: string;
  private cachedDeviceInfo: DeviceInfo | null = null;

  constructor(terminal: any, flashMap: FlashMap, baseUrl: string = '') {
    this.terminal = terminal;
    this.flashMap = flashMap;
    this.baseUrl = baseUrl;
  }

  /**
   * Search for a byte sequence and replace it with another sequence
   * Used for patching the base firmware at 0x00000
   */
  private patchBytes(data: ArrayBuffer, search: number[], replacement: number[]): ArrayBuffer {
    const modArray = new Uint8Array(data);
    
    // Find the search sequence
    for (let i = 0; i <= modArray.length - search.length; i++) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (modArray[i + j] !== search[j]) {
          found = false;
          break;
        }
      }
      if (found) {
        // Replace with replacement bytes
        for (let j = 0; j < replacement.length; j++) {
          modArray[i + j] = replacement[j];
        }
        if (debugMode) {
          this.terminal.writeLine(`[DEBUG] Found pattern [${search.join(', ')}] at offset 0x${i.toString(16)}`);
          this.terminal.writeLine(`[DEBUG] Replaced with [${replacement.join(', ')}]`);
        }
        break; // Only replace first occurrence
      }
    }
    
    return modArray.buffer;
  }

  /**
   * Patch the configuration section at 0x7f000
   * Writes initialization config for device setup
   */
  private patchConfig(data: ArrayBuffer, wifiConfig?: WifiConfig): ArrayBuffer {
    const encoder = new TextEncoder();
    const modArray = new Uint8Array(data);
    
    // Build configuration object
    const configuration: Record<string, string> = {
      flasher: 'webflasherv3',
      devicename: 'O.MG'
    };
    
    // Add WiFi settings if provided
    if (wifiConfig) {
      configuration.wifimode = wifiConfig.mode === 'ap' ? '2' : '1';
      configuration.wifissid = wifiConfig.ssid;
      configuration.wifikey = wifiConfig.password;
    }
    
    // Build the config string (same format as old code)
    let ccfg = 'INIT;F:keylog=0;';
    
    // Blank out file system slots
    for (let i = 1; i < 8; i++) {
      ccfg += `F:payload${i}=0;`;
    }
    
    // Prepare boot and hid file slots
    ccfg += 'F:bootscript=4;F:hidxfile=16;';
    
    // Set payload slots
    for (let i = 1; i < 51; i++) {
      ccfg += `F:payload${i}=4;`;
    }
    
    // Add keylog slot
    ccfg += 'F:keylog=100%F;';
    
    // Add settings
    for (const [key, value] of Object.entries(configuration)) {
      ccfg += `S:${key}=${value};`;
    }
    
    // Null terminate
    ccfg += '\0';
    
    // Encode and write to buffer at position 0
    const finalCfg = encoder.encode(ccfg);
    for (let i = 0; i < finalCfg.length && i < modArray.length; i++) {
      modArray[i] = finalCfg[i];
    }
    
    if (debugMode) {
      this.terminal.writeLine(`[DEBUG] Full config string:`);
      this.terminal.writeLine(ccfg);
    } else {
      this.terminal.writeLine(`[INFO] Patched config: ${ccfg.substring(0, 50)}...`);
    }
    
    return modArray.buffer;
  }

  /**
   * Patch the WiFi configuration section at 0x7e000
   * Writes JSON WiFi config for the device
   */
  private patchWifi(data: ArrayBuffer, wifiConfig?: WifiConfig): ArrayBuffer {
    const encoder = new TextEncoder();
    const modArray = new Uint8Array(data);
    
    // If no WiFi config, return unmodified
    if (!wifiConfig) {
      return modArray.buffer;
    }
    
    // Build WiFi config JSON (same format as old code)
    const config: Record<string, any> = {
      hostname: 'OMG'
    };
    
    if (wifiConfig.mode === 'ap') {
      // Access Point mode
      config.soft_ap = {
        ssid: wifiConfig.ssid,
        key: wifiConfig.password,
        channel: 1
      };
    } else {
      // Station mode (connect to existing network)
      config.station = {
        ap_list: [{
          ssid: wifiConfig.ssid,
          key: wifiConfig.password,
          primary: 1
        }]
      };
    }
    
    // Create the final string with WIFI prefix
    let wcfg = JSON.stringify(config) + '\0';
    const finalCfg = encoder.encode(`WIFI${wcfg}`);
    
    // Write to buffer at position 0
    for (let i = 0; i < finalCfg.length && i < modArray.length; i++) {
      modArray[i] = finalCfg[i];
    }
    
    if (debugMode) {
      this.terminal.writeLine(`[DEBUG] Full WiFi config:`);
      this.terminal.writeLine(`WIFI${wcfg}`);
    } else {
      this.terminal.writeLine(`[INFO] Patched WiFi config: mode=${wifiConfig.mode}, ssid=${wifiConfig.ssid}`);
    }
    
    return modArray.buffer;
  }

  /**
   * Apply all firmware patches to the loaded binaries
   */
  private patchFirmware(
    fileArray: { data: ArrayBuffer; address: number; name: string }[],
    wifiConfig?: WifiConfig
  ): { data: ArrayBuffer; address: number; name: string }[] {
    this.terminal.writeLine('[INFO] Applying firmware patches...');
    
    if (debugMode) {
      this.terminal.writeLine(`[DEBUG] Total files to patch: ${fileArray.length}`);
      this.terminal.writeLine(`[DEBUG] WiFi config provided: ${wifiConfig ? 'yes' : 'no'}`);
    }
    
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const offsetHex = '0x' + file.address.toString(16).padStart(5, '0');
      
      if (debugMode) {
        this.terminal.writeLine(`[DEBUG] Processing file: ${file.name} at ${offsetHex} (${file.data.byteLength} bytes)`);
      }
      
      if (offsetHex === '0x00000') {
        // Patch base firmware: search for [0, 32] and replace with [3, 48]
        this.terminal.writeLine(`[INFO] Patching base firmware at ${offsetHex}`);
        fileArray[i].data = this.patchBytes(file.data, [0, 32], [3, 48]);
      } else if (offsetHex === '0x7f000') {
        // Patch config section
        this.terminal.writeLine(`[INFO] Patching config section at ${offsetHex}`);
        fileArray[i].data = this.patchConfig(file.data, wifiConfig);
      } else if (offsetHex === '0x7e000') {
        // Patch WiFi section
        this.terminal.writeLine(`[INFO] Patching WiFi section at ${offsetHex}`);
        fileArray[i].data = this.patchWifi(file.data, wifiConfig);
      }
    }
    
    this.terminal.writeLine('[OK] Firmware patches applied');
    return fileArray;
  }

  private async loadFile(fileName: string, url?: string): Promise<ArrayBuffer> {
    // Use provided URL, or construct from baseUrl + fileName, or just fileName
    const fileUrl = url || (this.baseUrl ? `${this.baseUrl}/${fileName}` : fileName);
    
    // Try to use cache manager for remote files (GitHub)
    if ((window as any).cacheManager && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
      try {
        const data = await (window as any).cacheManager.fetchWithCache(fileUrl, 'binary');
        // Convert Uint8Array to ArrayBuffer
        return data.buffer.slice(data.byteOffset, data.byteLength + data.byteOffset);
      } catch (error) {
        this.terminal.writeLine(`[WARNING] Cache fetch failed for ${fileName}, falling back to direct fetch`);
        // Fall through to regular fetch with retry
      }
    }
    
    // Try with retry logic for GitHub downloads (fallback or non-cached)
    let retries = 3;
    while (retries > 0) {
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error('Empty file received');
        }
        return await blob.arrayBuffer();
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error(`Failed to load file: ${fileName} from ${fileUrl} - ${error}`);
        }
        this.terminal.writeLine(`[INFO] Retry loading ${fileName}... (${3 - retries}/3)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Failed to load file after retries: ${fileName}`);
  }

  private arrayBufferToBinaryString(buffer: ArrayBuffer): string {
    // esptool-js expects a binary string (each char = 1 byte), NOT base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  private async readFlashData(address: number, length: number): Promise<Uint8Array | null> {
    if (!this.espLoader || !this.espLoader.chip) {
      this.terminal.writeLine('[ERROR] Not connected to ESP device');
      return null;
    }

    try {
      const SPIFLASH_READ = 0x03;
      const result = new Uint8Array(length);
      
      for (let i = 0; i < length; i += 4) {
        const readLen = Math.min(4, length - i);
        const addr = address + i;
        
        const addrBytes = new Uint8Array([
          (addr >> 16) & 0xff,
          (addr >> 8) & 0xff,
          addr & 0xff
        ]);
        
        const value = await (this.espLoader as any).run_spiflash_command(SPIFLASH_READ, addrBytes, readLen * 8);
        
        for (let j = 0; j < readLen; j++) {
          result[i + j] = (value >> (j * 8)) & 0xff;
        }
      }
      
      return result;
    } catch (error) {
      this.terminal.writeLine(`[ERROR] Failed to read flash at 0x${address.toString(16)}: ${error}`);
      return null;
    }
  }

  private parseDeviceInfo(data: Uint8Array): DeviceInfo | null {
    try {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let offset = 0;
      
      const magic_code = view.getUint16(offset, true);
      offset += 2;
      
      if (magic_code !== 0xBF1F) {
        return {
          valid: false,
          magic_code: magic_code
        };
      }
      
      const prod_type = new TextDecoder('utf-8').decode(data.slice(offset, offset + 4));
      offset += 4;
      
      const flash_size = view.getUint8(offset);
      offset += 1;
      
      const device_id_raw = data.slice(offset, offset + 8);
      const device_id = new TextDecoder('utf-8').decode(device_id_raw).replace(/\0/g, '');
      offset += 8;
      
      const fwver_raw = data.slice(offset, offset + 18);
      const fwver = new TextDecoder('utf-8').decode(fwver_raw).replace(/\0/g, '');
      offset += 18;
      
      const branch_raw = data.slice(offset, offset + 12);
      const branch = new TextDecoder('utf-8').decode(branch_raw).replace(/\0/g, '');
      offset += 12;
      
      const commit = view.getUint32(offset, true);
      offset += 4;
      
      const firmware_checksum = view.getUint32(offset, true);
      offset += 4;
      
      const ofat_ver = view.getUint8(offset);
      offset += 1;
      
      const ofat_filespace_size = view.getUint16(offset, true);
      offset += 2;
      
      const ofat_freespace = view.getUint16(offset, true);
      offset += 2;
      
      const pagempfs_size = view.getUint16(offset, true);
      offset += 2;
      
      return {
        valid: true,
        magic_code: magic_code,
        prod_type: prod_type,
        flash_size: flash_size,
        device_id: device_id,
        fwver: fwver,
        branch: branch,
        commit: commit,
        firmware_checksum: firmware_checksum,
        ofat_ver: ofat_ver,
        ofat_filespace_size: ofat_filespace_size,
        ofat_freespace: ofat_freespace,
        pagempfs_size: pagempfs_size
      };
    } catch (error) {
      this.terminal.writeLine(`[ERROR] Failed to parse device info: ${error}`);
      return null;
    }
  }

  public async connect(preSelectedPort?: SerialPort): Promise<void> {
    const maxRetries = 4;
    let attempt = 1;
    
    try {
      // Use pre-selected port if provided, otherwise request a new one
      const port = preSelectedPort || await navigator.serial.requestPort();
      const transport = new Transport(port);
      this.espLoader = new ESPLoader(transport, 115200, this.terminal);
      
      // Retry logic for connection with proper timing
      while (attempt <= maxRetries) {
        try {
          this.terminal.writeLine(`[INFO] Connecting... (attempt ${attempt}/${maxRetries})`);
          await this.espLoader.connect();
          
          // Give it a moment to stabilize
          await new Promise(resolve => setTimeout(resolve, 50));
          
          this.terminal.writeLine('[OK] Connected to ESP device');
          
          // Upload and start the stub flasher for full command support
          this.terminal.writeLine('[INFO] Uploading stub flasher...');
          await this.espLoader.run_stub();
          this.terminal.writeLine('[OK] Stub flasher running');
          break;
        } catch (error: any) {
          if ((error.name === 'BreakError' || error.name === 'BufferOverrunError') && attempt < maxRetries) {
            this.terminal.writeLine(`[WARNING] Caught ${error.name}, retrying in ${attempt * 500}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 500));
            attempt++;
            continue;
          }
          throw error;
        }
      }
      
      if (attempt > maxRetries) {
        throw new Error('Failed to connect after multiple retries');
      }
    } catch (error) {
      this.terminal.writeLine(`[ERROR] Connection error: ${error}`);
      throw error;
    }
  }
  
  public async getFlashSize(): Promise<string> {
    if (!this.espLoader || !this.espLoader.chip) {
      throw new Error('Not connected to ESP device');
    }
    
    try {
      // Prefer calculating flash size from the SPI flash ID, like esptool flash-id
      let flashSizeKB = 1024; // Default to 1MB

      // Method 1: Use SPI flash ID and DETECTED_FLASH_SIZES from esptool-js
      let flashIdSuccess = false;
      try {
        const flashId = await this.espLoader.read_flash_id();
        // Flash ID format: [manufacturer (8 bits)] [device type (8 bits)] [capacity (8 bits)]
        // Size code is in the third byte (bits 16-23), not the first byte
        const sizeCode = (flashId >> 16) & 0xff;
        const sizeString = (this.espLoader as any).DETECTED_FLASH_SIZES?.[sizeCode] as string | undefined;

        if (sizeString) {
          // sizeString is like "1MB", "2MB", "4MB", etc.
          if (sizeString.toUpperCase().endsWith('MB')) {
            const mb = parseInt(sizeString, 10) || 1;
            flashSizeKB = mb * 1024;
          } else if (sizeString.toUpperCase().endsWith('KB')) {
            const kb = parseInt(sizeString, 10) || 1024;
            flashSizeKB = kb;
          }
          flashIdSuccess = true;
          this.terminal.writeLine(
            `[INFO] Detected flash size from RDID 0x${flashId.toString(16)} (code 0x${sizeCode.toString(16)}): ${flashSizeKB}KB (${flashSizeKB/1024}MB)`
          );
        } else {
          this.terminal.writeLine(
            `[WARNING] Flash ID 0x${flashId.toString(16)} has unknown size code 0x${sizeCode.toString(16)}, trying efuse fallback...`
          );
        }
      } catch (flashIdError) {
        this.terminal.writeLine('[WARNING] Could not read SPI flash ID, trying efuse fallback...');
      }

      // Method 2 (fallback): try efuse on ESP8266-style chips if flash ID didn't work
      if (!flashIdSuccess) {
        try {
          if (typeof (this.espLoader.chip as any).read_efuse === 'function') {
            const efuse3 = await (this.espLoader.chip as any).read_efuse(this.espLoader, 2);
            const efuse0 = await (this.espLoader.chip as any).read_efuse(this.espLoader, 0);
            
            // Check for ESP8285 variants with known flash sizes
            // ESP8285H16 = 16Mbit = 2MB, ESP8285N08 = 8Mbit = 1MB
            const is_8285 = ((efuse0 & (1 << 4)) | (efuse3 & (1 << 16))) != 0;
            
            if (is_8285) {
              // For ESP8285, check efuse for flash size info
              // The flash size is often encoded in efuse or we can infer from chip variant
              const efuse2 = await (this.espLoader.chip as any).read_efuse(this.espLoader, 3);
              const flashSizeBits = (efuse2 >> 24) & 0xf;
              
              // Known mappings: 0x0/0x1 = 1MB, 0x2 = 2MB, 0x4 = 4MB
              if (flashSizeBits >= 2) {
                flashSizeKB = 2048;
              } else {
                flashSizeKB = 1024;
              }
              this.terminal.writeLine(
                `[INFO] Detected ESP8285 with flash size from efuse: ${flashSizeKB}KB (${flashSizeKB/1024}MB)`
              );
            } else {
              this.terminal.writeLine('[INFO] ESP8266EX detected, using default 1MB (external flash size unknown)');
            }
          } else {
            this.terminal.writeLine('[INFO] No efuse-based flash size available, using default 1MB');
          }
        } catch (efuseError) {
          this.terminal.writeLine('[WARNING] Could not read efuse for flash size, using default 1MB');
        }
      }

      return flashSizeKB.toString();
    } catch (error) {
      this.terminal.writeLine(`[WARNING] Flash size detection failed, defaulting to 1MB`);
      this.terminal.writeLine(`[INFO] Please manually select the correct flash size if needed`);
      return '1024';
    }
  }

  public async flash(
    flashSize: '1024' | '2048' = '1024',
    wifiConfig?: WifiConfig,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (!this.espLoader || !this.espLoader.chip) {
      throw new Error('Not connected to ESP device');
    }

    const files = this.flashMap[flashSize];
    if (!files) {
      throw new Error(`Flash size ${flashSize}KB not found in flash map`);
    }

    // Calculate max progress like old code: 110 base + (files * 100)
    // 110 is for loading (10) and patching (100) phases
    const totalFiles = files.filter(f => f.type === 'file' || f.type === 'blank').length;
    const maxProgress = 110 + (totalFiles * 100);
    let currHighestProgress = 0;
    
    // Helper to calculate and report unified progress
    const reportProgress = (rawProgress: number, phase: FlashProgress['phase'], message: string) => {
      let percent = Math.round((rawProgress / maxProgress) * 100);
      // Prevent progress from going backwards
      if (percent < currHighestProgress) {
        percent = currHighestProgress;
      } else {
        currHighestProgress = percent;
      }
      onProgress?.({ phase, percent, message });
    };

    // Report initial progress
    reportProgress(0, 'loading', 'Starting flash process...');

    this.terminal.writeLine(`----------------------------------------`);
    this.terminal.writeLine(`[INFO] Starting flash process for ${flashSize}KB flash size`);
    this.terminal.writeLine(`[INFO] Base URL: ${this.baseUrl}`);
    this.terminal.writeLine(`[INFO] Files to process: ${files.length}`);

    // Prepare file array - keep as ArrayBuffer for patching
    const rawFileArray: { data: ArrayBuffer; address: number; name: string }[] = [];
    let loadedFiles = 0;

    for (const file of files) {
      try {
        const address = parseInt(file.offset, 16);
        
        if (file.type === 'file') {
          this.terminal.writeLine(`[INFO] Loading file: ${file.name} from ${file.url || 'local'}`);
          const data = await this.loadFile(file.name, file.url);
          rawFileArray.push({ data, address, name: file.name });
          const sizeKB = Math.round(data.byteLength / 1024 * 100) / 100;
          this.terminal.writeLine(
            `[OK] Loaded ${file.name}: ${data.byteLength} bytes (${sizeKB}KB) -> flash offset 0x${address.toString(16).toUpperCase()}`
          );
        } else if (file.type === 'blank') {
          // Create blank data for patching (blank regions need to be patched too)
          const blankSize = 4096; // Default blank region size
          const blankData = new Uint8Array(blankSize).fill(0xff);
          rawFileArray.push({ data: blankData.buffer, address, name: file.name });
          this.terminal.writeLine(
            `[INFO] Blank region: ${file.name} at 0x${address.toString(16).toUpperCase()} (${blankSize} bytes)`
          );
        }
        
        loadedFiles++;
        // Loading phase uses first 10 units of progress (out of 110 base)
        const loadProgress = Math.round((loadedFiles / totalFiles) * 10);
        reportProgress(loadProgress, 'loading', `Loaded ${file.name}`);
      } catch (error) {
        this.terminal.writeLine(`[ERROR] Error processing ${file.name}: ${error}`);
        throw error;
      }
    }

    if (rawFileArray.length === 0) {
      throw new Error('No files to flash');
    }

    // Apply firmware patches (uses 10-110 of base progress)
    reportProgress(10, 'patching', 'Applying firmware patches...');
    const patchedFiles = this.patchFirmware(rawFileArray, wifiConfig);
    reportProgress(110, 'patching', 'Patches applied');

    // Convert to binary string for esptool-js (NOT base64)
    const fileArray: { data: string; address: number }[] = patchedFiles.map(f => ({
      data: this.arrayBufferToBinaryString(f.data),
      address: f.address
    }));

    // Flash all files with detailed logging
    this.terminal.writeLine(`[INFO] Writing ${fileArray.length} file(s) to flash...`);
    
    // Log each file being flashed
    for (let i = 0; i < fileArray.length; i++) {
      const file = patchedFiles[i];
      const sizeKB = Math.round(file.data.byteLength / 1024 * 100) / 100;
      this.terminal.writeLine(
        `[INFO] File ${i + 1}/${fileArray.length}: ${file.name} -> 0x${fileArray[i].address.toString(16).toUpperCase()} (${sizeKB}KB)`
      );
    }

    reportProgress(110, 'flashing', 'Writing to flash...');
    
    await this.espLoader.write_flash(
      fileArray,
      'keep',
      'keep',
      'keep',
      false,
      true,
      (fileIndex, written, total) => {
        const filePercent = Math.round((written / total) * 100);
        const currentFile = patchedFiles[fileIndex];
        const fileName = currentFile ? currentFile.name : `file${fileIndex + 1}`;
        this.terminal.write(`\r[INFO] Writing ${fileName}: ${filePercent}% (${written}/${total} bytes)`);
        
        // Calculate progress like old code: ((fileIndex + 1) * 100) + filePercent
        // Add 110 base for loading/patching phases
        const rawProgress = 110 + ((fileIndex + 1) * 100) + filePercent;
        reportProgress(rawProgress, 'flashing', `Writing ${fileName}: ${filePercent}%`);
      }
    );

    this.terminal.writeLine('\n[OK] Flash process completed successfully');
    reportProgress(maxProgress, 'complete', 'Flash completed successfully!');
  }

  public async readDeviceInfo(address: number = 0x7F000): Promise<DeviceInfo | null> {
    if (!this.espLoader || !this.espLoader.chip) {
      this.terminal.writeLine('[ERROR] Not connected to ESP device');
      console.error('Not connected to ESP device');
      return null;
    }

    // Return cached data if available
    if (this.cachedDeviceInfo !== null) {
      console.log('Using cached device info:', JSON.stringify(this.cachedDeviceInfo, null, 2));
      return this.cachedDeviceInfo;
    }

    try {
      this.terminal.writeLine(`[INFO] Reading device info from flash at 0x${address.toString(16).toUpperCase()}...`);
      console.log(`Reading device info from flash at 0x${address.toString(16).toUpperCase()}...`);
      
      const DEVICE_INFO_SIZE = 60;
      const data = await this.readFlashData(address, DEVICE_INFO_SIZE);
      
      if (!data) {
        console.error('Failed to read flash data');
        return null;
      }
      
      const deviceInfo = this.parseDeviceInfo(data);
      
      if (deviceInfo) {
        // Cache the device info
        this.cachedDeviceInfo = deviceInfo;
        
        if (deviceInfo.valid) {
          this.terminal.writeLine('[OK] Valid device info found');
          this.terminal.writeLine(`[INFO] Magic Code: 0x${deviceInfo.magic_code?.toString(16).toUpperCase()}`);
          this.terminal.writeLine(`[INFO] Product Type: ${deviceInfo.prod_type}`);
          this.terminal.writeLine(`[INFO] Flash Size: ${deviceInfo.flash_size}MB`);
          this.terminal.writeLine(`[INFO] Device ID: ${deviceInfo.device_id}`);
          this.terminal.writeLine(`[INFO] Firmware Version: ${deviceInfo.fwver}`);
          this.terminal.writeLine(`[INFO] Branch: ${deviceInfo.branch}`);
          this.terminal.writeLine(`[INFO] Commit: 0x${deviceInfo.commit?.toString(16).toUpperCase()}`);
          
          console.log('Device Info:', JSON.stringify(deviceInfo, null, 2));
        } else {
          this.terminal.writeLine(`[WARNING] Invalid magic code: 0x${deviceInfo.magic_code?.toString(16).toUpperCase()} (expected 0xBF1F)`);
          console.warn(`Invalid magic code: 0x${deviceInfo.magic_code?.toString(16).toUpperCase()} (expected 0xBF1F)`);
          console.log('Device Info:', JSON.stringify(deviceInfo, null, 2));
        }
      }
      
      return deviceInfo;
    } catch (error) {
      this.terminal.writeLine(`[ERROR] Failed to read device info: ${error}`);
      console.error('Failed to read device info:', error);
      return null;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.espLoader) {
      try {
        // Try hard reset first
        if (this.espLoader.transport) {
          try {
            await this.espLoader.hard_reset();
          } catch (error) {
            // Ignore errors during reset
          }
          
          // Close the transport/port properly
          try {
            await this.espLoader.transport.disconnect();
          } catch (error) {
            // Ignore errors during disconnect
          }
        }
      } catch (error) {
        // Ignore any errors during cleanup
      } finally {
        this.espLoader = null;
        this.cachedDeviceInfo = null;
        this.terminal.writeLine('[INFO] Disconnected from ESP device');
      }
    }
  }
}

export default ESPFlasher;
