/**
 * Debug utilities for development - storage and memory inspection
 * Only use in development mode
 */

export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: string[];
  timestamp: string;
}

export const DebugService = {
  /**
   * Capture a snapshot of all browser storage
   */
  captureStorageSnapshot(): StorageSnapshot {
    const snapshot: StorageSnapshot = {
      localStorage: {},
      sessionStorage: {},
      cookies: [],
      timestamp: new Date().toISOString(),
    };

    // Capture localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        // Truncate long values for readability
        snapshot.localStorage[key] = value.length > 100 
          ? `${value.substring(0, 100)}... (${value.length} chars)` 
          : value;
      }
    }

    // Capture sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key) || '';
        snapshot.sessionStorage[key] = value.length > 100 
          ? `${value.substring(0, 100)}... (${value.length} chars)` 
          : value;
      }
    }

    // Capture cookies
    if (document.cookie) {
      snapshot.cookies = document.cookie.split(';').map(c => c.trim());
    }

    return snapshot;
  },

  /**
   * Log storage snapshot to console with formatting
   */
  logStorageSnapshot(label: string = 'Storage Snapshot'): void {
    const snapshot = this.captureStorageSnapshot();
    
    console.group(`🔍 ${label} - ${snapshot.timestamp}`);
    
    // localStorage
    const localCount = Object.keys(snapshot.localStorage).length;
    if (localCount > 0) {
      console.group(`📦 localStorage (${localCount} items)`);
      Object.entries(snapshot.localStorage).forEach(([key, value]) => {
      });
      console.groupEnd();
    } else {
    }
    
    // sessionStorage
    const sessionCount = Object.keys(snapshot.sessionStorage).length;
    if (sessionCount > 0) {
      console.group(`📋 sessionStorage (${sessionCount} items)`);
      Object.entries(snapshot.sessionStorage).forEach(([key, value]) => {
      });
      console.groupEnd();
    } else {
    }
    
    // Cookies
    if (snapshot.cookies.length > 0) {
      console.group(`🍪 cookies (${snapshot.cookies.length} items)`);
      snapshot.cookies.forEach(cookie => {
      });
      console.groupEnd();
    } else {
    }
    
    console.groupEnd();
    
    return;
  },

  /**
   * Check for any sensitive data patterns in storage
   */
  auditStorageForSensitiveData(): { found: boolean; warnings: string[] } {
    const snapshot = this.captureStorageSnapshot();
    const warnings: string[] = [];
    
    const sensitivePatterns = [
      { pattern: /token/i, label: 'token' },
      { pattern: /github/i, label: 'github' },
      { pattern: /auth/i, label: 'auth' },
      { pattern: /secret/i, label: 'secret' },
      { pattern: /password/i, label: 'password' },
      { pattern: /key/i, label: 'key' },
      { pattern: /jwt/i, label: 'jwt' },
      { pattern: /bearer/i, label: 'bearer' },
    ];
    
    // Check localStorage
    Object.keys(snapshot.localStorage).forEach(key => {
      sensitivePatterns.forEach(({ pattern, label }) => {
        if (pattern.test(key)) {
          warnings.push(`⚠️ localStorage contains key matching '${label}': ${key}`);
        }
      });
    });
    
    // Check sessionStorage
    Object.keys(snapshot.sessionStorage).forEach(key => {
      sensitivePatterns.forEach(({ pattern, label }) => {
        if (pattern.test(key)) {
          warnings.push(`⚠️ sessionStorage contains key matching '${label}': ${key}`);
        }
      });
    });
    
    if (warnings.length > 0) {
      console.warn('🚨 Sensitive data patterns found in storage:');
      warnings.forEach(w => console.warn(w));
    } else {
    }
    
    return { found: warnings.length > 0, warnings };
  },

  /**
   * Verify storage is clean after logout
   */
  verifyCleanLogout(): boolean {
    console.group('🧹 Post-Logout Storage Verification');
    
    const snapshot = this.captureStorageSnapshot();
    const issues: string[] = [];
    
    // Check for any remaining items
    const localCount = Object.keys(snapshot.localStorage).length;
    const sessionCount = Object.keys(snapshot.sessionStorage).length;
    
    if (localCount > 0) {
      issues.push(`localStorage still has ${localCount} items`);
      Object.keys(snapshot.localStorage).forEach(key => {
        issues.push(`  - ${key}`);
      });
    }
    
    if (sessionCount > 0) {
      issues.push(`sessionStorage still has ${sessionCount} items`);
      Object.keys(snapshot.sessionStorage).forEach(key => {
        issues.push(`  - ${key}`);
      });
    }
    
    if (issues.length > 0) {
      console.error('❌ Storage not fully cleared after logout:');
      issues.forEach(i => console.error(i));
      console.groupEnd();
      return false;
    }
    
    console.groupEnd();
    return true;
  },
};

// Expose to window for dev console access
if (typeof window !== 'undefined') {
  (window as any).__DEBUG__ = DebugService;
}
