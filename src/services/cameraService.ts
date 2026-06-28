import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface CameraStatus {
  connected: boolean;
  manufacturer?: string;
  model?: string;
  batteryLevel?: number; // 0.0 to 1.0
  type?: 'OSC' | 'Insta360';
  ip?: string;
}

// standard IPs
const THETA_IP = '192.168.1.1';
const INSTA_IP = '192.168.42.1:8000';

class CameraServiceClass {
  private activeType: 'OSC' | 'Insta360' | null = null;
  private activeIp: string | null = null;
  private isSimulated = false;

  enableSimulation(flag: boolean) {
    this.isSimulated = flag;
    if (flag) {
      this.activeType = 'OSC';
      this.activeIp = '127.0.0.1';
    } else {
      this.activeType = null;
      this.activeIp = null;
    }
  }

  getSimulationStatus(): boolean {
    return this.isSimulated;
  }

  async checkConnection(): Promise<CameraStatus> {
    if (this.isSimulated) {
      return {
        connected: true,
        manufacturer: 'Virtuelle',
        model: '360° Cam (Simuliert)',
        batteryLevel: 0.88,
        type: 'OSC',
        ip: '127.0.0.1',
      };
    }

    if (Platform.OS === 'web') {
      return { connected: false };
    }

    // Check for Insta360 specific API
    const instaIps = [INSTA_IP, '192.168.42.1', '192.168.42.1:8000'];
    for (const ip of instaIps) {
      try {
        const response = await fetch(`http://${ip}/api/v1/camera/info`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const data = await response.json();
          this.activeType = 'Insta360';
          this.activeIp = ip;
          return {
            connected: true,
            manufacturer: 'Insta360',
            model: data.model || 'X-Series',
            batteryLevel: data.battery ? data.battery / 100 : undefined,
            type: 'Insta360',
            ip: ip,
          };
        }
      } catch (_e) {
        // ignore and try next
      }
    }

    // Try OSC (Theta & generic Insta360 fallback)
    const oscIps = [THETA_IP, '192.168.42.1', '192.168.42.1:8000'];
    for (const ip of oscIps) {
      try {
        const response = await fetch(`http://${ip}/osc/info`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const data = await response.json();
          this.activeType = 'OSC';
          this.activeIp = ip;

          // Fetch state to get battery level
          let batteryLevel: number | undefined;
          try {
            const stateRes = await fetch(`http://${ip}/osc/state`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(1000),
            });
            if (stateRes.ok) {
              const stateData = await stateRes.json();
              batteryLevel = stateData.state?.batteryLevel;
            }
          } catch (_err) {}

          return {
            connected: true,
            manufacturer: data.manufacturer || 'RICOH', // Many return RICOH even if Insta360 sometimes, or we can use data.manufacturer
            model: data.model || '360 Camera',
            batteryLevel,
            type: 'OSC',
            ip: ip,
          };
        }
      } catch (_e) {
        // ignore
      }
    }

    this.activeType = null;
    this.activeIp = null;
    return { connected: false };
  }

  async takePhoto(): Promise<string> {
    if (this.isSimulated) {
      // Simulate capture delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/2294472375_24a3b8ef46_o.jpg';
    }

    if (!this.activeType || !this.activeIp) {
      throw new Error('Keine Kamera verbunden');
    }

    if (this.activeType === 'Insta360') {
      const response = await fetch(`http://${this.activeIp}/api/v1/camera/take_photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Insta360 Aufnahme fehlgeschlagen');
      }
      const resData = await response.json();
      // Expecting { code: 200, data: { url: "http://..." } } or similar
      const fileUrl = resData.data?.url || resData.url;
      if (!fileUrl) {
        throw new Error('Kein Dateipfad von Insta360 zurückgegeben');
      }
      return fileUrl;
    } else {
      // OSC / Theta photo capture
      const response = await fetch(`http://${this.activeIp}/osc/commands/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'camera.takePicture',
        }),
      });
      if (!response.ok) {
        throw new Error('OSC Aufnahme fehlgeschlagen');
      }
      const data = await response.json();
      const commandId = data.id;

      if (data.state === 'done') {
        return data.results?.fileUrl;
      }

      // Poll command status
      let attempts = 0;
      const maxAttempts = 15;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusRes = await fetch(`http://${this.activeIp}/osc/commands/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: commandId }),
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.state === 'done') {
            const fileUrl = statusData.results?.fileUrl;
            if (fileUrl) return fileUrl;
            throw new Error('Dateipfad in OSC-Antwort fehlt');
          } else if (statusData.state === 'error') {
            throw new Error(`Kamerafehler bei Aufnahme: ${statusData.error?.message || 'Unbekannt'}`);
          }
        }
        attempts++;
      }
      throw new Error('Timeout beim Warten auf Foto-Fertigstellung');
    }
  }

  async downloadPhoto(remoteUrl: string, onProgress?: (progress: number) => void): Promise<string> {
    const filename = remoteUrl.split('/').pop() || 'photo_360.jpg';
    const localUri = `${FileSystem.documentDirectory}${Date.now()}_${filename}`;

    if (onProgress) {
      const downloadResumable = FileSystem.createDownloadResumable(
        remoteUrl,
        localUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          onProgress(progress);
        }
      );
      const downloadRes = await downloadResumable.downloadAsync();
      if (!downloadRes || downloadRes.status !== 200) {
        throw new Error('Download fehlgeschlagen');
      }
      return downloadRes.uri;
    } else {
      const downloadRes = await FileSystem.downloadAsync(remoteUrl, localUri, {});
      if (downloadRes.status !== 200) {
        throw new Error(`Download fehlgeschlagen mit Status: ${downloadRes.status}`);
      }
      return downloadRes.uri;
    }
  }

  getLivePreviewHtml(): string {
    if (this.isSimulated) {
      return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; display: flex; justify-content: center; align-items: center; overflow: hidden; font-family: sans-serif; }
          #preview {
            width: 100%;
            height: 100%;
            background-image: url('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/2294472375_24a3b8ef46_o.jpg');
            background-size: cover;
            background-position: center;
            animation: pan 25s linear infinite;
          }
          @keyframes pan {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }
          .badge {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(76, 217, 100, 0.85);
            color: white;
            padding: 6px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div id="preview"></div>
        <div class="badge">📡 Live-Simulation</div>
      </body>
      </html>
      `;
    }

    if (this.activeType === 'Insta360' || this.activeIp === '192.168.42.1' || this.activeIp === '192.168.42.1:8000') {
      // Insta360 consumer cameras do not support HTTP MJPEG preview. They use proprietary RTSP/RTMP or require the native SDK.
      // We show a "Ready to capture" placeholder instead.
      return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #1c1c1e; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; color: white; }
          .icon { font-size: 48px; margin-bottom: 16px; }
          .title { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
          .subtitle { font-size: 14px; color: #8e8e93; text-align: center; padding: 0 20px; }
        </style>
      </head>
      <body>
        <div class="icon">📷</div>
        <div class="title">Insta360 Verbunden</div>
        <div class="subtitle">Live-Vorschau wird von diesem Modell nicht unterstützt. Die Kamera ist bereit für die Aufnahme.</div>
      </body>
      </html>
      `;
    } else {
      // OSC / Theta live preview using fetch ReadableStream parser
      return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; display: flex; justify-content: center; align-items: center; overflow: hidden; }
          canvas { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <canvas id="live-canvas"></canvas>
        <script>
          const canvas = document.getElementById('live-canvas');
          const ctx = canvas.getContext('2d');
          
          async function startStream() {
            try {
              const response = await fetch('http://${this.activeIp || THETA_IP}/osc/commands/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'camera.getLivePreview' })
              });
              
              if (!response.ok) {
                document.body.innerHTML = '<p style="color:white;text-align:center;">Vorschau konnte nicht gestartet werden</p>';
                return;
              }
              
              const reader = response.body.getReader();
              let buffer = new Uint8Array(0);
              
              while(true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                // Append new chunk to buffer
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;
                
                // Find JPEG frame boundaries
                let startIdx = -1;
                for (let i = 0; i < buffer.length - 1; i++) {
                  if (buffer[i] === 0xFF && buffer[i+1] === 0xD8) {
                    startIdx = i;
                    break;
                  }
                }
                
                if (startIdx !== -1) {
                  let endIdx = -1;
                  for (let i = startIdx; i < buffer.length - 1; i++) {
                    if (buffer[i] === 0xFF && buffer[i+1] === 0xD9) {
                      endIdx = i + 2;
                      break;
                    }
                  }
                  
                  if (endIdx !== -1) {
                    // Extract frame
                    const frameData = buffer.slice(startIdx, endIdx);
                    buffer = buffer.slice(endIdx); // keep remaining bytes
                    
                    const blob = new Blob([frameData], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    
                    const img = new Image();
                    img.onload = () => {
                      canvas.width = img.width;
                      canvas.height = img.height;
                      ctx.drawImage(img, 0, 0);
                      URL.revokeObjectURL(url);
                    };
                    img.src = url;
                  }
                }
              }
            } catch(err) {
              console.error(err);
              document.body.innerHTML = '<p style="color:white;text-align:center;">Verbindung zur Kamera unterbrochen</p>';
            }
          }
          
          startStream();
        </script>
      </body>
      </html>
      `;
    }
  }
}

export const CameraService = new CameraServiceClass();
