import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Project, Marker, useProjectStore } from '../store/useProjectStore';

/**
 * Service to generate a structured PDF report of a project,
 * including floor plans, marker crops, text notes, and photos.
 */
class PdfReportServiceClass {
  /**
   * Helper to convert a local file URI to Base64, resizing and compressing it first
   * to prevent memory spikes and WebView crashes.
   */
  private async fileToBase64(uri?: string, maxDimension: number = 1600): Promise<string | null> {
    if (!uri) return null;
    
    // If it's already a base64 data url or a remote url, return as is
    if (uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri;
    }

    // Check if the image format is PNG (case-insensitive, ignoring query parameters)
    const isPng = uri.toLowerCase().split('?')[0].endsWith('.png');
    const saveFormat = isPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG;
    const mimeType = isPng ? 'image/png' : 'image/jpeg';

    const { settings } = useProjectStore.getState();
    const exportQuality = settings.exportQuality || 'medium';

    // Set max dimension and compress quality based on exportQuality
    let MAX_DIMENSION = maxDimension;
    let compressVal = 0.7;
    if (exportQuality === 'high') {
      MAX_DIMENSION = maxDimension === 400 ? 400 : 2400;
      compressVal = 0.9;
    } else if (exportQuality === 'low') {
      MAX_DIMENSION = maxDimension === 400 ? 300 : 1000;
      compressVal = 0.5;
    } else {
      MAX_DIMENSION = maxDimension === 400 ? 400 : 1600;
      compressVal = 0.7;
    }

    try {
      // Clean up the URI (remove file:// prefix if needed for reading on some platforms)
      const cleanUri = uri.startsWith('file://') ? uri : `file://${uri}`;

      // 1. Get original dimensions of the image to scale appropriately
      let width = 0;
      let height = 0;
      try {
        const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          Image.getSize(cleanUri, (w, h) => resolve({ width: w, height: h }), reject);
        });
        width = size.width;
        height = size.height;
      } catch (err) {
        console.warn('[PDF Image Optimizer] Failed to get image size for:', cleanUri, err);
      }

      // 2. Set limits: we resize so that the maximum dimension (width or height) is at most MAX_DIMENSION.
      const actions = [];
      if (width > 0 && height > 0) {
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            actions.push({ resize: { width: MAX_DIMENSION } });
          } else {
            actions.push({ resize: { height: MAX_DIMENSION } });
          }
        }
      } else {
        // Fallback: assume landscape/360 and limit width
        actions.push({ resize: { width: MAX_DIMENSION } });
      }

      console.log(`[PDF Image Optimizer] Optimizing image: ${cleanUri.substring(0, 60)}... Target max: ${MAX_DIMENSION} (Quality: ${exportQuality})`);

      // 3. Perform image manipulation (resize + compress) and get base64 directly
      const result = await ImageManipulator.manipulateAsync(
        cleanUri,
        actions,
        {
          compress: compressVal,
          format: saveFormat,
          base64: true,
        }
      );

      if (result.base64) {
        return `data:${mimeType};base64,${result.base64}`;
      }

      // Fallback: Read file as base64 if manipulator output didn't return it
      const base64 = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:${mimeType};base64,${base64}`;
    } catch (err) {
      console.warn('Failed to resize or read image as base64:', uri, err);
      
      // Fallback: try reading the raw file directly as base64 without resizing
      try {
        const cleanUri = uri.startsWith('file://') ? uri : `file://${uri}`;
        const base64 = await FileSystem.readAsStringAsync(cleanUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return `data:${mimeType};base64,${base64}`;
      } catch (fallbackErr) {
        console.error('Final base64 fallback failed for:', uri, fallbackErr);
        return uri;
      }
    }
  }

  /**
   * Generate the HTML template for the PDF report.
   */
  public async buildHtmlTemplate(
    project: Project, 
    markers: Marker[],
    onProgress?: (current: number, total: number) => void
  ): Promise<string> {
    // 1. Gather all project markers
    const projectMarkers = markers.filter((m) => m.projectId === project.id);
    
    // Get company branding settings
    const { settings } = useProjectStore.getState();
    const logoBase64 = settings.companyLogoUri
      ? await this.fileToBase64(settings.companyLogoUri, 400)
      : null;
    const companyName = settings.companyName;
    const companyAddress = settings.companyAddress;
    
    // Calculate total local images to process for progress tracking
    let totalImages = 0;
    for (const marker of projectMarkers) {
      for (const item of (marker.media || [])) {
        if (item.type === 'photo' || item.type === 'photo360') {
          if (item.uri && !item.uri.startsWith('data:') && !item.uri.startsWith('http://') && !item.uri.startsWith('https://')) {
            totalImages++;
          }
        }
      }
    }

    // 2. Pre-process images sequentially to base64 for embedding (prevents memory spikes)
    let processedCount = 0;
    const processedMarkers = [];
    for (const marker of projectMarkers) {
      // Convert the floor plan crop to base64
      const cropBase64 = marker.cropBase64 
        ? await this.fileToBase64(marker.cropBase64) 
        : null;
        
      // Convert all media photos to base64
      const processedMedia = [];
      for (const item of (marker.media || [])) {
        if (item.type === 'photo' || item.type === 'photo360') {
          let base64Uri = item.uri;
          if (item.uri && !item.uri.startsWith('data:') && !item.uri.startsWith('http://') && !item.uri.startsWith('https://')) {
            processedCount++;
            if (onProgress) {
              onProgress(processedCount, totalImages);
            }
            base64Uri = await this.fileToBase64(item.uri) || item.uri;
          }
          processedMedia.push({ ...item, uri: base64Uri });
        } else {
          processedMedia.push(item);
        }
      }

      processedMarkers.push({
        ...marker,
        cropBase64,
        media: processedMedia,
      });
    }

    const reportDate = new Date(project.date).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const totalMarkers = projectMarkers.length;
    const totalPhotos = projectMarkers.reduce((acc, m) => acc + m.media.filter(item => item.type === 'photo' || item.type === 'photo360').length, 0);

    // 3. Build HTML structure
    let floorPlansHtml = '';
    
    if (project.floorPlans.length === 0) {
      floorPlansHtml = `
        <div class="empty-state">
          <p>Dieses Projekt enthält noch keine Grundriss-Pläne.</p>
        </div>
      `;
    } else {
      for (const fp of project.floorPlans) {
        const fpMarkers = processedMarkers.filter((m) => m.floorPlanId === fp.id);
        
        floorPlansHtml += `
          <div class="floor-plan-section">
            <h2 class="floor-plan-title">${escapeHtml(fp.name)}</h2>
            <p class="floor-plan-meta">${fpMarkers.length} Marker auf diesem Plan verortet</p>
        `;

        if (fpMarkers.length === 0) {
          floorPlansHtml += `
            <div class="empty-state">
              <p>Keine Marker auf diesem Plan platziert.</p>
            </div>
          `;
        } else {
          for (const marker of fpMarkers) {
            const notes = marker.media.filter((item) => item.type === 'note');
            const photos = marker.media.filter((item) => item.type === 'photo' || item.type === 'photo360');
            
            floorPlansHtml += `
              <div class="marker-card">
                <div class="marker-card-header">
                  <span class="marker-badge">📍</span>
                  <span class="marker-label">${escapeHtml(marker.label)}</span>
                  <span class="marker-time">${new Date(marker.createdAt).toLocaleDateString('de-DE')}</span>
                </div>
                
                <div class="marker-content-row">
                  <!-- Left: Floor plan crop location -->
                  <div class="marker-crop-container">
                    ${marker.cropBase64 ? `
                      <img src="${marker.cropBase64}" class="crop-image" alt="Grundriss Ausschnitt" />
                    ` : `
                      <div class="no-crop">
                        <div style="font-size: 24px; color: #8e8e93;">🗺️</div>
                        <div style="font-size: 11px; color: #aeaeb2; margin-top: 4px;">Keine Position verfügbar</div>
                      </div>
                    `}
                    <div class="crop-label">Position im Grundriss</div>
                  </div>
                  
                  <!-- Right: Details and comments -->
                  <div class="marker-details-container">
                    
                    <div class="notes-section">
                      <h4>Notizen:</h4>
                      ${notes.length === 0 ? `
                        <p class="no-notes">Keine schriftlichen Anmerkungen vorhanden.</p>
                      ` : `
                        <ul class="notes-list">
                          ${notes.map(n => `<li>${escapeHtml(n.text || '')}</li>`).join('')}
                        </ul>
                      `}
                    </div>
                  </div>
                </div>
                
                <!-- Bottom: Media files grid -->
                ${photos.length > 0 ? `
                  <div class="photos-section">
                    <h4>Fotodokumentation (${photos.length} Bilder):</h4>
                    <div class="photos-grid">
                      ${photos.map((p) => {
                        if (p.type === 'photo360') {
                          return `
                            <div class="photo-360-split-container">
                              <div class="photo-360-half" style="background-image: url('${p.uri}'); background-position: left center;">
                                <div class="photo-badge badge-360">🌐 360° Links (Front)</div>
                              </div>
                              <div class="photo-360-half" style="background-image: url('${p.uri}'); background-position: right center;">
                                <div class="photo-badge badge-360">🌐 360° Rechts (Back)</div>
                              </div>
                            </div>
                          `;
                        } else {
                          return `
                            <div class="photo-container-2d">
                              <img src="${p.uri}" class="photo-img-2d" />
                              <div class="photo-badge badge-2d">📷 Standardfoto</div>
                            </div>
                          `;
                        }
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }
        }
        
        floorPlansHtml += `</div>`; // Close floor-plan-section
      }
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fotodokumentation - ${escapeHtml(project.name)}</title>
        <style>
          @page {
            margin: 12mm 10mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1c1c1e;
            background-color: #ffffff;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            font-size: 14px;
          }
          
          /* Header branding */
          .header-container {
            border-bottom: 3px solid #5E5CE6;
            padding-bottom: 12px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .title-area h1 {
            margin: 0;
            font-size: 26px;
            color: #000;
            font-weight: 800;
          }
          .title-area p {
            margin: 5px 0 0 0;
            color: #8e8e93;
            font-size: 14px;
          }
          .branding-area {
            text-align: right;
            font-size: 11px;
            color: #3a3a3c;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
          }
          .company-logo {
            max-height: 50px;
            max-width: 180px;
            object-fit: contain;
            margin-bottom: 4px;
          }
          
          /* Stat Cards */
          .stats-row {
            display: flex;
            gap: 15px;
            margin-bottom: 30px;
          }
          .stat-card {
            background-color: #f2f2f7;
            border-radius: 8px;
            padding: 12px 20px;
            flex: 1;
          }
          .stat-card-num {
            font-size: 24px;
            font-weight: bold;
            color: #5E5CE6;
            margin-bottom: 2px;
          }
          .stat-card-label {
            font-size: 11px;
            text-transform: uppercase;
            color: #8e8e93;
            letter-spacing: 0.5px;
          }
          
          /* Section layout */
          .floor-plan-section {
            margin-top: 40px;
            page-break-before: auto;
          }
          .floor-plan-title {
            font-size: 18px;
            color: #000;
            border-bottom: 1px solid #e5e5ea;
            padding-bottom: 6px;
            margin: 0 0 4px 0;
            font-weight: 700;
          }
          .floor-plan-meta {
            font-size: 12px;
            color: #8e8e93;
            margin: 0 0 20px 0;
          }
          
          /* Marker card design */
          .marker-card {
            background-color: #ffffff;
            border: 1px solid #e5e5ea;
            border-radius: 10px;
            padding: 16px;
            margin-bottom: 25px;
            page-break-inside: avoid;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          }
          .marker-card-header {
            display: flex;
            align-items: center;
            margin-bottom: 14px;
            background-color: #f8f8fa;
            padding: 8px 12px;
            border-radius: 6px;
          }
          .marker-badge {
            font-size: 16px;
            margin-right: 8px;
          }
          .marker-label {
            font-size: 15px;
            font-weight: bold;
            color: #000;
            flex: 1;
          }
          .marker-time {
            font-size: 12px;
            color: #8e8e93;
          }
          
          .marker-content-row {
            display: flex;
            gap: 20px;
            margin-bottom: 16px;
          }
          
          /* Floor plan Crop styling (Enlarged) */
          .marker-crop-container {
            width: 280px;
            flex-shrink: 0;
          }
          .crop-image {
            width: 280px;
            height: 186px; /* 3:2 ratio */
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid #d1d1d6;
            background-color: #f2f2f7;
            display: block;
          }
          .no-crop {
            width: 280px;
            height: 186px;
            background-color: #f2f2f7;
            border-radius: 8px;
            border: 1px dashed #c7c7cc;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .crop-label {
            font-size: 10px;
            color: #8e8e93;
            text-align: center;
            margin-top: 5px;
            font-style: italic;
          }
          
          /* Details & Notes */
          .marker-details-container {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          .meta-info {
            font-size: 11px;
            color: #8e8e93;
            margin-bottom: 10px;
          }
          .notes-section h4 {
            margin: 0 0 6px 0;
            font-size: 12px;
            color: #3a3a3c;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .no-notes {
            margin: 0;
            font-style: italic;
            color: #aeaeb2;
            font-size: 13px;
          }
          .notes-list {
            margin: 0;
            padding-left: 20px;
            color: #3a3a3c;
            font-size: 13px;
          }
          .notes-list li {
            margin-bottom: 4px;
          }
          
          /* Photos section */
          .photos-section {
            margin-top: 14px;
            border-top: 1px solid #f2f2f7;
            padding-top: 14px;
          }
          .photos-section h4 {
            margin: 0 0 10px 0;
            font-size: 12px;
            color: #3a3a3c;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .photos-grid {
            display: flex;
            flex-direction: column;
            gap: 16px;
            width: 100%;
          }
          .photo-container-2d {
            position: relative;
            display: inline-block;
            width: 100%;
            max-width: 580px;
            margin-bottom: 8px;
            page-break-inside: avoid;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #e5e5ea;
            background-color: #f2f2f7;
          }
          .photo-img-2d {
            width: 100%;
            height: auto;
            max-height: 420px; /* Limit height to prevent page break issues */
            display: block;
            object-fit: contain; /* Don't crop the photo, preserve its natural aspect ratio */
          }
          .photo-badge {
            position: absolute;
            bottom: 8px;
            left: 8px;
            font-size: 10px;
            font-weight: bold;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
          }
          .badge-360 {
            background-color: rgba(94, 92, 230, 0.9); /* Violet */
          }
          .badge-2d {
            background-color: rgba(58, 58, 60, 0.9); /* Dark gray */
          }
          
          /* 360° Photo Split Halves Layout */
          .photo-360-split-container {
            display: flex;
            gap: 16px;
            width: 100%;
            box-sizing: border-box;
            page-break-inside: avoid;
          }
          .photo-360-half {
            flex: 1;
            aspect-ratio: 1 / 1; /* Keep as square (1:1) to perfectly match 180° field-of-view aspect ratio without stretching */
            max-height: 280px;
            background-size: 200% 100%;
            background-repeat: no-repeat;
            background-color: #f2f2f7;
            border-radius: 8px;
            border: 1px solid #e5e5ea;
            position: relative;
            overflow: hidden;
          }
          
          .empty-state {
            background-color: #f8f8fa;
            border-radius: 8px;
            padding: 24px;
            text-align: center;
            color: #8e8e93;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="title-area">
            <h1>Fotodokumentation</h1>
            <p style="margin: 4px 0 0 0; color: #3a3a3c; font-size: 13px;">
              Projekt: <strong>${escapeHtml(project.name)}</strong> · ${project.floorPlans.length} Pläne · ${totalMarkers} Marker · ${totalPhotos} Bilder
            </p>
            <div style="font-size: 11px; color: #8e8e93; margin-top: 4px;">Generiert am: ${reportDate}</div>
          </div>
          
          <div class="branding-area">
            ${logoBase64 ? `<img src="${logoBase64}" class="company-logo" />` : ''}
            ${companyName ? `<div style="font-weight: bold; font-size: 12px; color: #000; margin-bottom: 2px;">${escapeHtml(companyName)}</div>` : ''}
            ${companyAddress ? `<div style="white-space: pre-line; line-height: 1.3;">${escapeHtml(companyAddress)}</div>` : ''}
          </div>
        </div>
        
        ${floorPlansHtml}
      </body>
      </html>
    `;
  }

  /**
   * Generates a PDF from the project and opens the OS sharing dialog.
   */
  async exportProjectReport(project: Project, markers: Marker[], pregeneratedHtml?: string): Promise<boolean> {
    try {
      console.log('[PDF Export] Building HTML template...');
      const html = pregeneratedHtml || await this.buildHtmlTemplate(project, markers);
      console.log('[PDF Export] HTML template built. HTML string length:', html.length);
      
      console.log('[PDF Export] Printing to file via Print.printToFileAsync...');
      const { uri, base64 } = await Print.printToFileAsync({
        html,
        base64: true
      });
      console.log('[PDF Export] Print success. Raw output URI:', uri);

      // 3. Share the PDF using Expo Sharing
      if (Platform.OS === 'web') {
        // Web downloads PDF directly
        const link = document.createElement('a');
        link.href = uri;
        link.download = `Bericht_${project.name.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const isSharingAvailable = await Sharing.isAvailableAsync();
        if (!isSharingAvailable) {
          throw new Error('Teilen-Funktion ist auf diesem Gerät nicht verfügbar.');
        }

        if (!base64) {
          throw new Error('PDF-Generierung hat keine Base64-Daten geliefert.');
        }

        // Copy the file to the app's secure cache directory to satisfy scoped storage permissions.
        // Replace German umlauts and keep the filename strictly ASCII to avoid Uri parsing errors on Android.
        const cleanName = project.name
          .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
          .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
          .replace(/ß/g, 'ss')
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeFilename = `Bericht_${cleanName}.pdf`;
        const safeUri = `${FileSystem.cacheDirectory}${safeFilename}`;
        console.log('[PDF Export] Safe destination URI:', safeUri);

        console.log('[PDF Export] Writing base64 directly to safe location...');
        await FileSystem.writeAsStringAsync(safeUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('[PDF Export] Write success. Proceeding to shareAsync...');

        await Sharing.shareAsync(safeUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Fotodokumentation ${project.name} teilen`,
          UTI: 'com.adobe.pdf',
        });
      }
      return true;
    } catch (err) {
      console.error('Error generating or sharing PDF report:', err);
      throw err;
    }
  }
}

/**
 * Escapes characters to prevent HTML injection errors.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const PdfReportService = new PdfReportServiceClass();
