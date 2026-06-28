import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { triggerHaptic } from '../utils/hapticHelper';
import { useProjectStore, Marker } from '../store/useProjectStore';
import { Ionicons } from '@expo/vector-icons';
import { useCachedPdf } from '../hooks/useCachedPdf';

type Props = {
  projectId: string;
  floorPlanId: string;
  pdfUri: string;
  onMarkerClick: (markerId: string) => void;
  onPlanClick?: (x: number, y: number) => void;
  movingMarkerId?: string | null;
  movingPosition?: { x: number; y: number } | null;
  isPlacementActive?: boolean;
  overrideMarkers?: Marker[];
};

// We use an older, stable version of PDF.js from CDN for maximum compatibility
const getPdfJsHtml = (isWeb: boolean, hapticsEnabled: boolean) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=100.0, user-scalable=${isWeb ? 'no' : 'yes'}">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #E5E5EA; overflow: ${isWeb ? 'hidden' : 'auto'}; }
    #wrapper { width: 100%; height: 100%; position: absolute; left: 0; top: 0; ${!isWeb ? 'display: flex; justify-content: center; align-items: flex-start;' : 'overflow: hidden;'} }
    #container { position: ${isWeb ? 'absolute' : 'relative'}; left: 0; top: 0; margin: ${isWeb ? '0' : '20px auto'}; display: inline-block; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transform-origin: 0 0; }
    canvas { display: block; ${!isWeb ? 'max-width: 100%; height: auto;' : ''} }
    .marker { position: absolute; width: 38px; height: 38px; transform: translate(-50%, -100%); transform-origin: 50% 100%; pointer-events: auto; cursor: pointer; transition: opacity 0.15s ease, filter 0.15s ease; }
    .marker.dragging { opacity: 0.65; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.45)); }
    
    /* Zoom controls overlay for Web */
    #controls { position: fixed; top: 20px; right: 20px; display: ${isWeb ? 'flex' : 'none'}; flex-direction: column; gap: 10px; z-index: 1000; }
    .btn { background: #007AFF; color: white; border: none; border-radius: 50%; width: 44px; height: 44px; font-size: 24px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; user-select: none; }
    .btn:active { background: #005bb5; }
  </style>
</head>
<body>
  <div id="wrapper">
    <div id="container">
      <canvas id="the-canvas"></canvas>
      <div id="markers-layer"></div>
    </div>
  </div>
  
  <div id="controls">
    <button class="btn" id="zoom-in">+</button>
    <button class="btn" id="zoom-out">−</button>
  </div>

  <script>
    const IS_WEB = ${isWeb};
    const HAPTICS_ENABLED = ${hapticsEnabled};
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    
    window.postMessageToApp = function(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(msg);
      } else {
        window.parent.postMessage(msg, '*');
      }
    };

    const container = document.getElementById('container');
    const canvas = document.getElementById('the-canvas');
    const markersLayer = document.getElementById('markers-layer');
    
    let currentPdf = null;
    let baseRenderScale = 2.0; // Render at high resolution once
    let hasDragged = false;
    let isPlacementActive = false;

    // PanZoom state
    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    function updateTransform() {
      if (!IS_WEB) return;
      container.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
      
      // Keep markers at a constant size on screen by counter-scaling them
      const markers = document.querySelectorAll('.marker');
      markers.forEach(m => {
        m.style.transform = \`translate(-50%, -100%) scale(\${1 / scale})\`;
      });
    }

    function renderPage() {
      if (!currentPdf) return;
      currentPdf.getPage(1).then(function(page) {
        const viewport = page.getViewport({scale: baseRenderScale});
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        page.render(renderContext).promise.then(() => {
          if (IS_WEB) {
            // Adjust the container initially to fit the width of the screen
            const wrapperRect = document.getElementById('wrapper').getBoundingClientRect();
            // Fit to width with a 5% margin
            const initialScale = (wrapperRect.width / viewport.width) * 0.95;
            scale = initialScale;
            // Center horizontally
            translateX = (wrapperRect.width - (viewport.width * scale)) / 2;
            // Small padding from the top
            translateY = 20; 
            updateTransform();
          }
          if (window.lastMarkers && window.lastMarkers.length > 0) {
            generateCropsIfNeeded(window.lastMarkers);
          }
        });
      });
    }

    function loadPdf(source) {
      let loadingTask;
      if (source && source.startsWith('data:application/pdf;base64,')) {
        try {
          const base64Data = source.split(',')[1];
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } catch (err) {
          document.body.innerHTML = '<h2>Error decoding base64 PDF</h2><p>' + err.message + '</p>';
          window.postMessageToApp(JSON.stringify({ type: 'error', message: 'Decode Error: ' + err.message }));
          return;
        }
      } else {
        loadingTask = pdfjsLib.getDocument(source);
      }
      loadingTask.promise.then(function(pdf) {
        currentPdf = pdf;
        renderPage();
        
        if (!canvas.dataset.hasClickListener) {
          let pressTimer = null;
          let pressStartX = 0;
          let pressStartY = 0;
          let isGestureCancelled = false;
          const LONG_PRESS_DURATION = 600; // ms

          function startPress(clientX, clientY) {
            pressStartX = clientX;
            pressStartY = clientY;
            isGestureCancelled = false;
            
            if (pressTimer) clearTimeout(pressTimer);
            
            if (!isPlacementActive) {
              pressTimer = setTimeout(() => {
                if (!isGestureCancelled) {
                  const rect = canvas.getBoundingClientRect();
                  const x = (clientX - rect.left) / rect.width;
                  const y = (clientY - rect.top) / rect.height;
                  window.postMessageToApp(JSON.stringify({ type: 'click', x: x, y: y }));
                }
                pressTimer = null;
              }, LONG_PRESS_DURATION);
            }
          }

          function cancelPress() {
            isGestureCancelled = true;
            if (pressTimer) {
              clearTimeout(pressTimer);
              pressTimer = null;
            }
          }

          function checkMove(clientX, clientY) {
            const dx = clientX - pressStartX;
            const dy = clientY - pressStartY;
            if (Math.sqrt(dx * dx + dy * dy) > 10) {
              cancelPress();
            }
          }

          function endPress(clientX, clientY) {
            if (isPlacementActive && !isGestureCancelled) {
              const rect = canvas.getBoundingClientRect();
              const x = (clientX - rect.left) / rect.width;
              const y = (clientY - rect.top) / rect.height;
              window.postMessageToApp(JSON.stringify({ type: 'click', x: x, y: y }));
            }
            cancelPress();
          }

          // Mouse Events (PC)
          canvas.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            startPress(e.clientX, e.clientY);
          });
          canvas.addEventListener('mousemove', function(e) {
            checkMove(e.clientX, e.clientY);
          });
          canvas.addEventListener('mouseup', function(e) {
            endPress(e.clientX, e.clientY);
          });
          canvas.addEventListener('mouseleave', cancelPress);

          // Touch Events (Smartphone)
          canvas.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) {
              cancelPress();
              return;
            }
            const touch = e.touches[0];
            startPress(touch.clientX, touch.clientY);
          });
          canvas.addEventListener('touchmove', function(e) {
            if (e.touches.length > 1) {
              cancelPress();
              return;
            }
            const touch = e.touches[0];
            checkMove(touch.clientX, touch.clientY);
          });
          canvas.addEventListener('touchend', function(e) {
            const touch = e.changedTouches[0];
            endPress(touch.clientX, touch.clientY);
          });
          canvas.addEventListener('touchcancel', cancelPress);

          canvas.dataset.hasClickListener = 'true';
        }
        
        window.postMessageToApp(JSON.stringify({ type: 'loaded' }));
      }).catch(function(err) {
        document.body.innerHTML = '<h2>Error loading PDF</h2><p>' + err.message + '</p>';
        window.postMessageToApp(JSON.stringify({ type: 'error', message: 'PDF.js Error: ' + err.message }));
      });
    }

    if (IS_WEB) {
      const wrapper = document.getElementById('wrapper');
      
      wrapper.addEventListener('mousedown', (e) => {
        if (e.target.closest('.btn') || e.target.closest('.marker')) return;
        isDragging = true;
        hasDragged = false;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        wrapper.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        // Mark as dragged if moved more than 5px
        if (Math.abs(e.clientX - translateX - startX) > 5 || Math.abs(e.clientY - translateY - startY) > 5) {
          hasDragged = true;
        }
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
        wrapper.style.cursor = 'default';
      });

      // Zoom to mouse
      wrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const zoomSensitivity = 0.003;
        const delta = -e.deltaY * zoomSensitivity;
        let newScale = scale * Math.exp(delta);
        
        newScale = Math.max(0.1, Math.min(newScale, 5.0));

        const ratioX = (e.clientX - translateX) / scale;
        const ratioY = (e.clientY - translateY) / scale;

        scale = newScale;

        translateX = e.clientX - (ratioX * scale);
        translateY = e.clientY - (ratioY * scale);

        updateTransform();
      }, { passive: false });

      // Buttons
      document.getElementById('zoom-in').addEventListener('click', () => {
        const wrapperRect = wrapper.getBoundingClientRect();
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;
        
        const newScale = Math.min(scale * 1.5, 5.0);
        const ratioX = (centerX - translateX) / scale;
        const ratioY = (centerY - translateY) / scale;
        
        scale = newScale;
        translateX = centerX - (ratioX * scale);
        translateY = centerY - (ratioY * scale);
        updateTransform();
      });

      document.getElementById('zoom-out').addEventListener('click', () => {
        const wrapperRect = wrapper.getBoundingClientRect();
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;
        
        const newScale = Math.max(scale / 1.5, 0.1);
        const ratioX = (centerX - translateX) / scale;
        const ratioY = (centerY - translateY) / scale;
        
        scale = newScale;
        translateX = centerX - (ratioX * scale);
        translateY = centerY - (ratioY * scale);
        updateTransform();
      });
    } else {
      // Mobile native zoom handling
      if (window.visualViewport) {
        const updateMobileMarkers = () => {
          const vScale = window.visualViewport.scale;
          const markers = document.querySelectorAll('.marker');
          markers.forEach(m => {
            m.style.transform = 'translate(-50%, -100%) scale(' + (1 / vScale) + ')';
          });
        };
        window.visualViewport.addEventListener('resize', updateMobileMarkers);
        window.visualViewport.addEventListener('scroll', updateMobileMarkers);
      }
    }

    window.lastMarkers = [];
    const generatedMarkerCrops = new Set();

    function drawPinOnCrop(ctx, x, y) {
      ctx.save();
      ctx.translate(x, y);
      
      // Draw teardrop pin shape pointing at (0, 0)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-12, -12, -12, -28, 0, -28);
      ctx.bezierCurveTo(12, -28, 12, -12, 0, 0);
      
      ctx.fillStyle = '#9C8BD9'; // Violet branding color
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#4D2C9B'; // Dark purple border
      ctx.stroke();
      
      // Cutout center
      ctx.beginPath();
      ctx.arc(0, -18, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      
      ctx.restore();
    }

    function generateCropForMarker(m) {
      const W = canvas.width;
      const H = canvas.height;
      if (!W || !H) return null;

      // Crop box width: 25% of canvas width (clamped between 250px and 600px)
      // Crop box height: 18% of canvas height (clamped between 180px and 450px)
      const cropW = Math.max(250, Math.min(W * 0.25, 600));
      const cropH = Math.max(180, Math.min(H * 0.18, 450));

      const px = m.x * W;
      const py = m.y * H;

      let sx = px - cropW / 2;
      let sy = py - cropH / 2;

      // Restrain within canvas boundaries
      if (sx < 0) sx = 0;
      if (sy < 0) sy = 0;
      if (sx + cropW > W) sx = W - cropW;
      if (sy + cropH > H) sy = H - cropH;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 300;
      tempCanvas.height = 200;
      const tempCtx = tempCanvas.getContext('2d');

      // Draw the cropped portion of the floor plan
      tempCtx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, 300, 200);

      // Determine where the marker is relative to the crop area, scaled to 300x200
      const relX = ((px - sx) / cropW) * 300;
      const relY = ((py - sy) / cropH) * 200;

      // Draw the zentrierter pin
      drawPinOnCrop(tempCtx, relX, relY);

      return tempCanvas.toDataURL('image/jpeg', 0.85);
    }

    function generateCropsIfNeeded(markersList) {
      if (!currentPdf || !canvas.width || !canvas.height) return;
      
      const cropsToSend = [];
      markersList.forEach(function(m) {
        const cacheKey = m.id + '_' + m.x + '_' + m.y;
        if (!generatedMarkerCrops.has(cacheKey)) {
          if (m.cropBase64) {
            generatedMarkerCrops.add(cacheKey);
            return;
          }
          try {
            const crop = generateCropForMarker(m);
            if (crop) {
              cropsToSend.push({ markerId: m.id, cropBase64: crop });
              generatedMarkerCrops.add(cacheKey);
            }
          } catch (err) {
            console.error('Error generating crop for marker ' + m.id, err);
          }
        }
      });

      if (cropsToSend.length > 0) {
        window.postMessageToApp(JSON.stringify({ type: 'cropsGenerated', crops: cropsToSend }));
      }
    }

    // Drag & Drop logic for markers with long-press threshold
    let isDraggingMarker = false;
    let draggedMarkerId = null;
    let dragStartClientX = 0;
    let dragStartClientY = 0;
    let dragTimer = null;
    const MARKER_LONG_PRESS_DURATION = 500; // ms

    // Mouse events (Web)
    markersLayer.addEventListener('mousedown', function(e) {
      const markerEl = e.target.closest('.marker');
      if (!markerEl) return;
      e.stopPropagation();
      e.preventDefault();
      
      draggedMarkerId = markerEl.dataset.id;
      dragStartClientX = e.clientX;
      dragStartClientY = e.clientY;
      isDraggingMarker = false;
      
      if (dragTimer) clearTimeout(dragTimer);
      dragTimer = setTimeout(function() {
        isDraggingMarker = true;
        markerEl.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
        window.postMessageToApp(JSON.stringify({ type: 'markerDragStart' }));
      }, MARKER_LONG_PRESS_DURATION);
    });

    window.addEventListener('mousemove', function(e) {
      if (!draggedMarkerId) return;
      
      const dx = e.clientX - dragStartClientX;
      const dy = e.clientY - dragStartClientY;
      const dist = Math.hypot(dx, dy);
      
      if (!isDraggingMarker) {
        // If they move too much before the long press duration, cancel the drag start
        if (dist > 8) {
          if (dragTimer) {
            clearTimeout(dragTimer);
            dragTimer = null;
          }
          draggedMarkerId = null; // Reset
        }
        return;
      }
      
      e.stopPropagation();
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      let x = (e.clientX - rect.left) / rect.width;
      let y = (e.clientY - rect.top) / rect.height;
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      
      const markerEl = document.querySelector('.marker[data-id="' + draggedMarkerId + '"]');
      if (markerEl) {
        markerEl.style.left = (x * 100) + '%';
        markerEl.style.top = (y * 100) + '%';
      }
    });

    window.addEventListener('mouseup', function(e) {
      if (dragTimer) {
        clearTimeout(dragTimer);
        dragTimer = null;
      }
      
      if (!draggedMarkerId) return;
      
      e.stopPropagation();
      e.preventDefault();
      
      const markerEl = document.querySelector('.marker[data-id="' + draggedMarkerId + '"]');
      if (markerEl) {
        markerEl.classList.remove('dragging');
      }
      
      if (isDraggingMarker) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        window.postMessageToApp(JSON.stringify({ type: 'markerMoved', markerId: draggedMarkerId, x: x, y: y }));
      } else {
        // Was a short click -> open details
        window.postMessageToApp(JSON.stringify({ type: 'markerClick', markerId: draggedMarkerId }));
      }
      
      isDraggingMarker = false;
      draggedMarkerId = null;
      document.body.style.cursor = 'default';
    });

    // Touch events (Mobile Native)
    markersLayer.addEventListener('touchstart', function(e) {
      const markerEl = e.target.closest('.marker');
      if (!markerEl) return;
      e.stopPropagation();
      e.preventDefault(); // Prevents scroll/zoom
      
      const touch = e.touches[0];
      draggedMarkerId = markerEl.dataset.id;
      dragStartClientX = touch.clientX;
      dragStartClientY = touch.clientY;
      isDraggingMarker = false;
      
      if (dragTimer) clearTimeout(dragTimer);
      dragTimer = setTimeout(function() {
        isDraggingMarker = true;
        markerEl.classList.add('dragging');
        // Simple haptic feedback if supported by browser/platform
        if (HAPTICS_ENABLED && navigator.vibrate) {
          navigator.vibrate(40);
        }
        window.postMessageToApp(JSON.stringify({ type: 'markerDragStart' }));
      }, MARKER_LONG_PRESS_DURATION);
    }, { passive: false });

    window.addEventListener('touchmove', function(e) {
      if (!draggedMarkerId) return;
      
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartClientX;
      const dy = touch.clientY - dragStartClientY;
      const dist = Math.hypot(dx, dy);
      
      if (!isDraggingMarker) {
        if (dist > 8) {
          if (dragTimer) {
            clearTimeout(dragTimer);
            dragTimer = null;
          }
          draggedMarkerId = null; // Reset
        }
        return;
      }
      
      e.stopPropagation();
      e.preventDefault(); // Prevents scroll/zoom of webview page
      
      const rect = canvas.getBoundingClientRect();
      let x = (touch.clientX - rect.left) / rect.width;
      let y = (touch.clientY - rect.top) / rect.height;
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      
      const markerEl = document.querySelector('.marker[data-id="' + draggedMarkerId + '"]');
      if (markerEl) {
        markerEl.style.left = (x * 100) + '%';
        markerEl.style.top = (y * 100) + '%';
      }
    }, { passive: false });

    window.addEventListener('touchend', function(e) {
      if (dragTimer) {
        clearTimeout(dragTimer);
        dragTimer = null;
      }
      
      if (!draggedMarkerId) return;
      
      e.stopPropagation();
      e.preventDefault();
      
      const touch = e.changedTouches[0];
      const markerEl = document.querySelector('.marker[data-id="' + draggedMarkerId + '"]');
      if (markerEl) {
        markerEl.classList.remove('dragging');
      }
      
      if (isDraggingMarker) {
        const rect = canvas.getBoundingClientRect();
        let x = (touch.clientX - rect.left) / rect.width;
        let y = (touch.clientY - rect.top) / rect.height;
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        window.postMessageToApp(JSON.stringify({ type: 'markerMoved', markerId: draggedMarkerId, x: x, y: y }));
      } else {
        window.postMessageToApp(JSON.stringify({ type: 'markerClick', markerId: draggedMarkerId }));
      }
      
      isDraggingMarker = false;
      draggedMarkerId = null;
    }, { passive: false });

    window.addEventListener('message', function(event) {
      try {
        let data = event.data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        if (data.type === 'loadPdfUri') {
          loadPdf(data.uri);
        } else if (data.type === 'updateMarkers') {
          markersLayer.innerHTML = '';
          const currentScale = IS_WEB ? scale : ((window.visualViewport && window.visualViewport.scale) || 1.0);
          window.lastMarkers = data.markers;
          data.markers.forEach(function(m) {
            const el = document.createElement('div');
            el.className = 'marker';
            el.dataset.id = m.id;
            el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d=\"M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z\" fill=\"#9C8BD9\" stroke=\"#4D2C9B\" stroke-width=\"2\" stroke-linejoin=\"round\" /></svg>';
            el.style.left = (m.x * 100) + '%';
            el.style.top = (m.y * 100) + '%';
            el.style.transform = 'translate(-50%, -100%) scale(' + (1 / currentScale) + ')';
            // Click handler is now fully managed via mouse/touch events for reliability, but we keep a click listener with stopPropagation just in case
            el.addEventListener('click', function(e) {
              e.stopPropagation();
            });
            markersLayer.appendChild(el);
          });
          
          generateCropsIfNeeded(window.lastMarkers);
        } else if (data.type === 'setPlacementActive') {
          isPlacementActive = data.active;
        }
      } catch(e) {}
    });
    
    document.addEventListener('message', function(event) {
      window.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
  </script>
</body>
</html>
`;

export default function PdfViewer({ 
  projectId, 
  floorPlanId, 
  pdfUri: originalPdfUri, 
  onMarkerClick, 
  onPlanClick,
  movingMarkerId,
  movingPosition,
  isPlacementActive = false,
  overrideMarkers
}: Props) {
  const { localUri: pdfUri, isCaching } = useCachedPdf(originalPdfUri, floorPlanId);
  const { markers: storeMarkers, addMarker, updateMarkerCrop, updateMarkerPosition, settings } = useProjectStore();
  const hapticsEnabled = settings.hapticsEnabled !== false;
  
  const activeMarkers = overrideMarkers || storeMarkers;
  const projectMarkers = activeMarkers.filter(m => m.projectId === projectId && m.floorPlanId === floorPlanId);
  const [loading, setLoading] = useState(true);
  const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
  const webviewRef = React.useRef<any>(null);

  useEffect(() => {
    console.log('[PdfViewer] Mounted! pdfUri:', pdfUri ? pdfUri.substring(0, 50) + '...' : 'undefined', 'isCaching:', isCaching);
    console.log('[PdfViewer] activeMarkers count:', activeMarkers.length);
  }, [pdfUri, isCaching, activeMarkers.length]);

  const handleMarkerAdded = useCallback((x: number, y: number) => {
    if (onPlanClick) {
      onPlanClick(x, y);
    } else {
      const newId = addMarker(projectId, floorPlanId, x, y);
      onMarkerClick(newId);
    }
  }, [addMarker, projectId, floorPlanId, onMarkerClick, onPlanClick]);

  const loadPdfData = useCallback(() => {
    console.log('[PdfViewer] loadPdfData called with pdfUri:', pdfUri ? pdfUri.substring(0, 50) + '...' : 'undefined');
    if (Platform.OS === 'web') return;
    const msg = JSON.stringify({ type: 'loadPdfUri', uri: pdfUri });
    webviewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} })); true;`);
  }, [pdfUri]);

  const syncMarkers = useCallback(() => {
    const syncedMarkers = projectMarkers.map(m => {
      if (movingMarkerId && m.id === movingMarkerId && movingPosition) {
        return { ...m, x: movingPosition.x, y: movingPosition.y, cropBase64: 'moving_preview' };
      }
      return m;
    });
    const msg = JSON.stringify({ type: 'updateMarkers', markers: syncedMarkers });
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(msg, '*');
      }
    } else {
      webviewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} })); true;`);
    }
  }, [projectMarkers, movingMarkerId, movingPosition, webviewRef]);

  const syncPlacementActive = useCallback(() => {
    const msg = JSON.stringify({ type: 'setPlacementActive', active: isPlacementActive });
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(msg, '*');
      }
    } else {
      webviewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} })); true;`);
    }
  }, [isPlacementActive, webviewRef]);

  useEffect(() => {
    if (isWebViewLoaded && !isCaching) {
      loadPdfData();
    }
  }, [isWebViewLoaded, isCaching, loadPdfData]);

  useEffect(() => {
    if (!loading) {
      syncMarkers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectMarkers, loading, movingMarkerId, movingPosition]);

  useEffect(() => {
    if (!loading) {
      syncPlacementActive();
    }
  }, [isPlacementActive, loading, syncPlacementActive]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data.type === 'click') {
            handleMarkerAdded(data.x, data.y);
          } else if (data.type === 'markerClick') {
            onMarkerClick(data.markerId);
          } else if (data.type === 'markerMoved') {
            updateMarkerPosition(data.markerId, data.x, data.y);
          } else if (data.type === 'loaded') {
            setLoading(false);
          } else if (data.type === 'cropsGenerated') {
            data.crops.forEach((crop: { markerId: string; cropBase64: string }) => {
              updateMarkerCrop(crop.markerId, crop.cropBase64);
            });
          } else if (data.type === 'markerDragStart') {
            triggerHaptic.selection();
          }
        } catch (_e) {}
      };
      window.addEventListener('message', handleWebMessage);
      
      setTimeout(() => {
        const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(JSON.stringify({ type: 'loadPdfUri', uri: pdfUri }), '*');
        }
      }, 500);
      
      return () => window.removeEventListener('message', handleWebMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pdfUri, handleMarkerAdded, onMarkerClick]);

  // Extract a directory or use the uri directly as baseUrl to allow CORS access
  const baseUrl = Platform.OS === 'android' ? 'file:///android_asset/' : pdfUri;

  const isLocalUriOnWeb = Platform.OS === 'web' && (pdfUri?.startsWith('file://') || pdfUri?.startsWith('content://'));

  if (Platform.OS === 'web') {
    if (isLocalUriOnWeb) {
      return (
        <View style={[styles.container, styles.errorContainer]}>
          <Ionicons name="cloud-offline-outline" size={48} color="#FF9500" style={{ marginBottom: 12 }} />
          <Text style={styles.errorTitle}>Plan nicht synchronisiert</Text>
          <Text style={styles.errorText}>
            Dieser Grundriss wurde lokal auf einem Mobilgerät hinzugefügt, aber die Übertragung in die Cloud wurde noch nicht abgeschlossen.
          </Text>
          <Text style={styles.errorSubText}>
            Bitte lade das PDF auf dem Mobilgerät erneut hoch, während eine Internetverbindung besteht.
          </Text>
        </View>
      );
    }

    if (isCaching) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Speichere PDF für Offline-Nutzung...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <iframe 
          id="pdf-iframe"
          srcDoc={getPdfJsHtml(true, hapticsEnabled)} 
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="PDF Viewer"
        />
        {loading && (
          <View style={styles.loadingContainer} pointerEvents="none">
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Lade PDF...</Text>
          </View>
        )}
      </View>
    );
  }

  if (isCaching) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Speichere PDF für Offline-Nutzung...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: getPdfJsHtml(false, hapticsEnabled), baseUrl: baseUrl }}
        onLoadEnd={() => {
          console.log('[PdfViewer] onLoadEnd triggered');
          setIsWebViewLoaded(true);
        }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'click') {
              handleMarkerAdded(data.x, data.y);
            } else if (data.type === 'markerClick') {
              onMarkerClick(data.markerId);
            } else if (data.type === 'markerMoved') {
              updateMarkerPosition(data.markerId, data.x, data.y);
            } else if (data.type === 'loaded') {
              setLoading(false);
            } else if (data.type === 'cropsGenerated') {
              data.crops.forEach((crop: { markerId: string; cropBase64: string }) => {
                updateMarkerCrop(crop.markerId, crop.cropBase64);
              });
            } else if (data.type === 'markerDragStart') {
              triggerHaptic.selection();
            } else if (data.type === 'error') {
              console.error('[PdfViewer] WebView Error:', data.message);
              setLoading(false); // Stop loading spinner so we can see the error
            }
          } catch(_e) {}
        }}
        style={styles.webview}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
      />
      {loading && (
        <View style={styles.loadingContainer} pointerEvents="none">
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Lade PDF...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#007AFF',
  },
  errorContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#3A3A3C',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  errorSubText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 16,
  }
});
