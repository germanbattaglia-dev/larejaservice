import fs from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

// SVG crafted to match the official Liliana logo geometry with precision
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" width="720" height="220">
  <style>
    .track-title {
      font-family: 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
      font-weight: 900;
      font-size: 26px;
      letter-spacing: 12px;
      fill: #000000;
    }
  </style>

  <!-- Background -->
  <rect width="720" height="220" fill="#FFFFFF"/>

  <!-- Top Title: ELECTRODOMESTICOS -->
  <text x="360" y="40" text-anchor="middle" class="track-title">ELECTRODOMESTICOS</text>

  <!-- Left Emblem: 4 Quadrants with Diagonal Red Lines -->
  <g transform="translate(35, 60)">
    <!-- Quadrant 1: Top-Left (///) -->
    <g transform="translate(0, 0)">
      <clipPath id="q1-clip">
        <rect width="60" height="60" rx="6" ry="6"/>
      </clipPath>
      <rect width="60" height="60" rx="6" ry="6" fill="#FFFFFF"/>
      <g clip-path="url(#q1-clip)" stroke="#E31E24" stroke-width="8" stroke-linecap="square">
        <line x1="-20" y1="20" x2="20" y2="-20"/>
        <line x1="-20" y1="40" x2="40" y2="-20"/>
        <line x1="-20" y1="60" x2="60" y2="-20"/>
        <line x1="-20" y1="80" x2="80" y2="-20"/>
        <line x1="0" y1="80" x2="80" y2="0"/>
        <line x1="20" y1="80" x2="80" y2="20"/>
        <line x1="40" y1="80" x2="80" y2="40"/>
      </g>
    </g>

    <!-- Quadrant 2: Top-Right (\\\) -->
    <g transform="translate(70, 0)">
      <clipPath id="q2-clip">
        <rect width="60" height="60" rx="6" ry="6"/>
      </clipPath>
      <rect width="60" height="60" rx="6" ry="6" fill="#FFFFFF"/>
      <g clip-path="url(#q2-clip)" stroke="#E31E24" stroke-width="8" stroke-linecap="square">
        <line x1="40" y1="-20" x2="80" y2="20"/>
        <line x1="20" y1="-20" x2="80" y2="40"/>
        <line x1="0" y1="-20" x2="80" y2="60"/>
        <line x1="-20" y1="-20" x2="80" y2="80"/>
        <line x1="-20" y1="0" x2="60" y2="80"/>
        <line x1="-20" y1="20" x2="40" y2="80"/>
        <line x1="-20" y1="40" x2="20" y2="80"/>
      </g>
    </g>

    <!-- Quadrant 3: Bottom-Left (\\\) -->
    <g transform="translate(0, 70)">
      <clipPath id="q3-clip">
        <rect width="60" height="60" rx="6" ry="6"/>
      </clipPath>
      <rect width="60" height="60" rx="6" ry="6" fill="#FFFFFF"/>
      <g clip-path="url(#q3-clip)" stroke="#E31E24" stroke-width="8" stroke-linecap="square">
        <line x1="40" y1="-20" x2="80" y2="20"/>
        <line x1="20" y1="-20" x2="80" y2="40"/>
        <line x1="0" y1="-20" x2="80" y2="60"/>
        <line x1="-20" y1="-20" x2="80" y2="80"/>
        <line x1="-20" y1="0" x2="60" y2="80"/>
        <line x1="-20" y1="20" x2="40" y2="80"/>
        <line x1="-20" y1="40" x2="20" y2="80"/>
      </g>
    </g>

    <!-- Quadrant 4: Bottom-Right (///) -->
    <g transform="translate(70, 70)">
      <clipPath id="q4-clip">
        <rect width="60" height="60" rx="6" ry="6"/>
      </clipPath>
      <rect width="60" height="60" rx="6" ry="6" fill="#FFFFFF"/>
      <g clip-path="url(#q4-clip)" stroke="#E31E24" stroke-width="8" stroke-linecap="square">
        <line x1="-20" y1="20" x2="20" y2="-20"/>
        <line x1="-20" y1="40" x2="40" y2="-20"/>
        <line x1="-20" y1="60" x2="60" y2="-20"/>
        <line x1="-20" y1="80" x2="80" y2="-20"/>
        <line x1="0" y1="80" x2="80" y2="0"/>
        <line x1="20" y1="80" x2="80" y2="20"/>
        <line x1="40" y1="80" x2="80" y2="40"/>
      </g>
    </g>
  </g>

  <!-- Wordmark "Liliana" -->
  <g fill="#E31E24">
    <!-- Capital L -->
    <path d="M 215,60 C 192,60 180,76 180,98 L 180,166 C 180,182 192,192 208,192 L 244,192 C 254,192 262,184 262,174 L 262,156 C 262,148 256,142 246,142 L 216,142 L 216,98 C 216,76 228,60 215,60 Z"/>

    <!-- First 'i' -->
    <circle cx="288" cy="74" r="15"/>
    <rect x="272" y="100" width="32" height="92" rx="14"/>

    <!-- 'l' -->
    <rect x="316" y="60" width="32" height="132" rx="14"/>

    <!-- Second 'i' -->
    <circle cx="376" cy="74" r="15"/>
    <rect x="360" y="100" width="32" height="92" rx="14"/>

    <!-- First 'a' -->
    <path d="M 432,96 C 404,96 388,114 388,146 C 388,178 404,196 432,196 C 448,196 460,186 468,170 L 468,186 C 468,192 472,196 480,196 L 496,196 C 502,196 506,192 506,186 L 506,106 C 506,100 502,96 496,96 L 480,96 C 472,96 468,100 468,106 L 468,118 C 460,104 448,96 432,96 Z M 442,126 C 458,126 468,138 468,152 C 468,166 458,170 442,170 C 426,170 416,160 416,146 C 416,132 426,126 442,126 Z"/>

    <!-- 'n' -->
    <path d="M 520,98 L 542,98 C 546,98 548,102 548,108 L 548,116 C 556,104 570,96 588,96 C 612,96 626,112 626,140 L 626,186 C 626,192 622,196 616,196 L 598,196 C 592,196 588,192 588,186 L 588,144 C 588,128 580,122 568,122 C 554,122 548,132 548,150 L 548,186 C 548,192 544,196 538,196 L 520,196 C 514,196 510,192 510,186 L 510,108 C 510,102 514,98 520,98 Z"/>

    <!-- Second 'a' -->
    <path d="M 662,96 C 634,96 618,114 618,146 C 618,178 634,196 662,196 C 678,196 690,186 698,170 L 698,186 C 698,192 702,196 710,196 L 726,196 C 732,196 736,192 736,186 L 736,106 C 736,100 732,96 726,96 L 710,96 C 702,96 698,100 698,106 L 698,118 C 690,104 678,96 662,96 Z M 672,126 C 688,126 698,138 698,152 C 698,166 688,170 672,170 C 656,170 646,160 646,146 C 646,132 656,126 672,126 Z"/>
  </g>
</svg>`;

const resvg = new Resvg(svgContent, {
  fitTo: { mode: 'width', value: 1440 },
});

const pngData = resvg.render().asPng();

fs.writeFileSync(path.join(process.cwd(), 'public', 'liliana.png'), pngData);
fs.writeFileSync(path.join(process.cwd(), 'public', 'liliana-official.png'), pngData);
fs.writeFileSync(path.join(process.cwd(), 'public', 'liliana.svg'), svgContent);
fs.writeFileSync(path.join(process.cwd(), 'public', 'liliana-official.svg'), svgContent);

console.log('Successfully regenerated full Liliana logo with crisp letters and no missing parts!');
