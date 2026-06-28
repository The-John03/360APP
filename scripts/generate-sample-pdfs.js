const fs = require('fs');
const path = require('path');

function generatePdf(pageTitle, rooms) {
  const objects = [];
  
  // Helper to register an object
  function addObj(content) {
    const id = objects.length + 1;
    objects.push({ id, content });
    return id;
  }

  // 1. Catalog
  const catalogId = addObj('<< /Type /Catalog /Pages 2 0 R >>');
  
  // 2. Pages
  const pagesId = addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  
  // 3. Page
  const pageId = addObj('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources 4 0 R /Contents 5 0 R >>');
  
  // 4. Resources
  const resourcesId = addObj('<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>');
  
  // 5. Contents Stream (Vector drawing for floor plan)
  let drawCommands = `
% Set line width and stroke color (dark gray)
0.3 0.3 0.3 RG
2.5 w

% Outer walls (rectangle x=50 y=50 width=740 height=495)
50 50 740 450 re S

% Draw inner walls (thick lines)
4.0 w
`;

  // Draw walls based on rooms
  if (pageTitle.includes('Erdgeschoss')) {
    drawCommands += `
% Horizontal partition
50 200 m 790 200 l S

% Vertical partitions
300 200 m 300 500 l S
520 200 m 520 500 l S
420 50 m 420 200 l S
`;
  } else {
    drawCommands += `
% Horizontal partition
50 220 m 790 220 l S

% Vertical partitions
260 220 m 260 500 l S
560 220 m 560 500 l S
350 50 m 350 220 l S
`;
  }

  // Draw doors (white rectangles overlaying the walls to look like door openings, with a swing line)
  drawCommands += `
% Door openings (white fills)
1.0 1.0 1.0 rg
`;

  if (pageTitle.includes('Erdgeschoss')) {
    drawCommands += `
% Entrance door
380 48 40 5 re f S
% Room doors
280 198 40 5 re f S
500 198 40 5 re f S
400 120 5 30 re f S
`;
  } else {
    drawCommands += `
% Balcony door
380 48 40 5 re f S
% Room doors
240 218 40 5 re f S
540 218 40 5 re f S
330 120 5 30 re f S
`;
  }

  // Draw windows (thin blue rectangles on outer walls)
  drawCommands += `
0.5 0.7 0.9 RG
1.5 w
70 48 80 4 re f S
700 48 80 4 re f S
150 498 120 4 re f S
450 498 120 4 re f S
48 280 4 80 re f S
788 280 4 80 re f S
`;

  // Draw room labels (text)
  drawCommands += `
0.1 0.1 0.1 rg
`;
  rooms.forEach(r => {
    drawCommands += `
BT
  /F1 ${r.size} Tf
  ${r.x} ${r.y} Td
  (${r.name}) Tj
ET
`;
  });

  // Draw title
  drawCommands += `
0.3 0.2 0.7 rg
BT
  /F1 22 Tf
  50 530 Td
  (${pageTitle}) Tj
ET
`;

  // Register contents object
  const cleanCommands = drawCommands.trim().replace(/\r\n/g, '\n');
  const streamLength = cleanCommands.length;
  const contentObjContent = `<< /Length ${streamLength} >>\nstream\n${cleanCommands}\nendstream`;
  addObj(contentObjContent);

  // Now assemble the PDF buffer and calculate exact offsets
  let pdf = '%PDF-1.4\n';
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${objects[i].id} 0 obj\n${objects[i].content}\nendobj\n`;
  }

  const startxref = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  
  for (let i = 0; i < offsets.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    pdf += `${offsetStr} 00000 n \n`;
  }

  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${startxref}\n`;
  pdf += '%%EOF\n';

  return Buffer.from(pdf, 'binary');
}

// Ensure output directories exist
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

// 1. Generate Erdgeschoss
const egRooms = [
  { name: 'Wohnzimmer (Muster)', x: 80, y: 350, size: 16 },
  { name: 'Kueche (Muster)', x: 340, y: 350, size: 14 },
  { name: 'Schlafzimmer (Muster)', x: 580, y: 350, size: 14 },
  { name: 'Bad (Muster)', x: 150, y: 110, size: 12 },
  { name: 'Flur / Eingang (Muster)', x: 480, y: 110, size: 13 }
];
const egPdf = generatePdf('Erdgeschoss (Musterplan)', egRooms);
fs.writeFileSync(path.join(assetsDir, 'erdgeschoss_muster.pdf'), egPdf);
console.log('Generated erdgeschoss_muster.pdf');

// 2. Generate 1. Obergeschoss
const ogRooms = [
  { name: 'Kinderzimmer 1 (Muster)', x: 80, y: 340, size: 14 },
  { name: 'Kinderzimmer 2 (Muster)', x: 340, y: 340, size: 14 },
  { name: 'Elternzimmer (Muster)', x: 580, y: 340, size: 14 },
  { name: 'Abstellraum (Muster)', x: 150, y: 110, size: 12 },
  { name: 'Flur OG (Muster)', x: 450, y: 110, size: 13 }
];
const ogPdf = generatePdf('1. Obergeschoss (Musterplan)', ogRooms);
fs.writeFileSync(path.join(assetsDir, 'obergeschoss_muster.pdf'), ogPdf);
console.log('Generated obergeschoss_muster.pdf');
