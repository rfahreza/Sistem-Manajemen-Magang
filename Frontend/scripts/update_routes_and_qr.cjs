const fs = require('fs');
const path = require('path');

// 1. Update main.jsx
const mainPath = path.join(__dirname, '../src/main.jsx');
let mainContent = fs.readFileSync(mainPath, 'utf8');

if (!mainContent.includes('ScanFacePage')) {
  mainContent = mainContent.replace(
    'import ScanQRCodePage from "./Pages/Auth/scan";',
    'import ScanQRCodePage from "./Pages/Auth/scan";\nimport ScanFacePage from "./Pages/Auth/scanFace";'
  );

  mainContent = mainContent.replace(
    '<Route path="/scan" element={<ScanQRCodePage />} />',
    '<Route path="/scan" element={<ScanQRCodePage />} />\n          <Route path="/scan-face" element={<ScanFacePage />} />'
  );

  fs.writeFileSync(mainPath, mainContent, 'utf8');
  console.log('main.jsx updated with /scan-face route');
} else {
  console.log('main.jsx already has ScanFacePage');
}

// 2. Update ScanQr.jsx with toggle link
const scanQrPath = path.join(__dirname, '../src/components/Layouts/ScanQr.jsx');
let scanQrContent = fs.readFileSync(scanQrPath, 'utf8');

if (!scanQrContent.includes('/scan-face')) {
  scanQrContent = scanQrContent.replace(
    'import { useNavigate } from "react-router-dom";',
    'import { useNavigate, Link } from "react-router-dom";\nimport { ScanFace } from "lucide-react";'
  );

  const targetBox = '</div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n      <Background />\n    </div>';
  const replacementBox = `</div>
              </div>

              {/* Switch to Face Scanner */}
              <div className="mt-4 pt-4 border-t border-gray-100 w-full flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Gunakan pengenalan wajah?
                </span>
                <Link
                  to="/scan-face"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                >
                  <ScanFace size={15} /> Beralih ke Absen Wajah
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Background />
    </div>`;

  scanQrContent = scanQrContent.replace(
    /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<Background \/>\s*<\/div>/,
    replacementBox
  );

  fs.writeFileSync(scanQrPath, scanQrContent, 'utf8');
  console.log('ScanQr.jsx updated with link to /scan-face');
} else {
  console.log('ScanQr.jsx already has link to /scan-face');
}
