class CacheManager {
  constructor() {
    this.CACHE_PREFIX = 'omg_flasher_';
    this.CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    this.METADATA_KEY = this.CACHE_PREFIX + 'metadata';
  }

  getMetadata() {
    try {
      const metadata = localStorage.getItem(this.METADATA_KEY);
      return metadata ? JSON.parse(metadata) : {};
    } catch (error) {
      console.error('Error reading cache metadata:', error);
      return {};
    }
  }

  setMetadata(metadata) {
    try {
      localStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Error saving cache metadata:', error);
    }
  }

  getCacheKey(url) {
    return this.CACHE_PREFIX + btoa(url).replace(/[^a-zA-Z0-9]/g, '_');
  }

  isExpired(timestamp) {
    return Date.now() - timestamp > this.CACHE_DURATION;
  }


  async get(url, type = 'json') {
    const cacheKey = this.getCacheKey(url);
    
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp, contentType } = JSON.parse(cached);
      
      if (this.isExpired(timestamp)) {
        console.log(`[Cache] Expired: ${url}`);
        this.remove(url);
        return null;
      }

      console.log(`[Cache] Hit: ${url}`);
      
      if (type === 'binary') {
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      } else {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`[Cache] Error reading ${url}:`, error);
      this.remove(url);
      return null;
    }
  }

  /**
   * Store item in cache
   * @param {string} url - URL of the resource
   * @param {any} data - Data to cache
   * @param {string} type - 'json' or 'binary'
   */
  async set(url, data, type = 'json') {
    const cacheKey = this.getCacheKey(url);
    
    try {
      let cacheData;
      
      if (type === 'binary') {
        const bytes = new Uint8Array(data);
        let binaryString = '';
        for (let i = 0; i < bytes.length; i++) {
          binaryString += String.fromCharCode(bytes[i]);
        }
        cacheData = btoa(binaryString);
      } else {
        cacheData = JSON.stringify(data);
      }

      const cacheEntry = {
        data: cacheData,
        timestamp: Date.now(),
        contentType: type,
        url: url,
        size: cacheData.length
      };

      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      
      const metadata = this.getMetadata();
      metadata[cacheKey] = {
        url,
        timestamp: cacheEntry.timestamp,
        size: cacheEntry.size,
        type
      };
      this.setMetadata(metadata);
      
      console.log(`[Cache] Stored: ${url} (${this.formatBytes(cacheEntry.size)})`);
    } catch (error) {
      console.error(`[Cache] Error storing ${url}:`, error);
      // If quota exceeded, try to clear some old items
      if (error.name === 'QuotaExceededError') {
        console.warn('[Cache] Quota exceeded, clearing old items...');
        this.clearOldest(5);
        // Try again
        try {
          await this.set(url, data, type);
        } catch (retryError) {
          console.error('[Cache] Still unable to cache after cleanup:', retryError);
        }
      }
    }
  }

  remove(url) {
    const cacheKey = this.getCacheKey(url);
    localStorage.removeItem(cacheKey);
    
    const metadata = this.getMetadata();
    delete metadata[cacheKey];
    this.setMetadata(metadata);
    
    console.log(`[Cache] Removed: ${url}`);
  }

  clearAll() {
    const metadata = this.getMetadata();
    Object.keys(metadata).forEach(key => {
      localStorage.removeItem(key);
    });
    
    localStorage.removeItem(this.METADATA_KEY);
    
    console.log('[Cache] All cache cleared');
  }

  clearOldest(count = 5) {
    const metadata = this.getMetadata();
    const items = Object.entries(metadata)
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, count);
    
    items.forEach(([key, item]) => {
      localStorage.removeItem(key);
      delete metadata[key];
      console.log(`[Cache] Removed old item: ${item.url}`);
    });
    
    this.setMetadata(metadata);
  }

  getStats() {
    const metadata = this.getMetadata();
    const items = Object.values(metadata);
    
    const totalSize = items.reduce((sum, item) => sum + (item.size || 0), 0);
    const jsonCount = items.filter(item => item.type === 'json').length;
    const binaryCount = items.filter(item => item.type === 'binary').length;
    
    return {
      totalItems: items.length,
      totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      jsonCount,
      binaryCount,
      items: items.map(item => ({
        url: item.url,
        type: item.type,
        size: this.formatBytes(item.size),
        age: this.formatAge(Date.now() - item.timestamp)
      }))
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatAge(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async fetchWithCache(url, type = 'json', forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.get(url, type);
      if (cached !== null) {
        return cached;
      }
    }

    console.log(`[Cache] Fetching: ${url}`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let data;
      if (type === 'binary') {
        const arrayBuffer = await response.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      } else {
        data = await response.json();
      }

      await this.set(url, data, type);
      
      return data;
    } catch (error) {
      console.error(`[Cache] Fetch error for ${url}:`, error);
      throw error;
    }
  }

  async preloadJSON(urls) {
    console.log('[Cache] Pre-loading JSON files...');
    const promises = urls.map(url => 
      this.fetchWithCache(url, 'json').catch(error => {
        console.error(`[Cache] Failed to preload ${url}:`, error);
        return null;
      })
    );
    
    await Promise.all(promises);
    console.log('[Cache] JSON pre-load complete');
  }
}

const cacheManager = new CacheManager();
window.cacheManager = cacheManager;
