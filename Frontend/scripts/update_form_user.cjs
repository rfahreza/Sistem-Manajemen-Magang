const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/components/Fragment/UserFragment/FormUser.jsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('FaceEnrollmentModal')) {
  // Add imports
  content = content.replace(
    'import { useAuth } from "../../Context/UserContext";',
    'import { useAuth } from "../../Context/UserContext";\nimport FaceEnrollmentModal from "./FaceEnrollmentModal";\nimport { ScanFace } from "lucide-react";'
  );

  // Add state
  content = content.replace(
    'const { user, updateProfile, updatePassword } = useAuth();',
    'const { user, updateProfile, updatePassword, refreshProfile } = useAuth();\n  const [showFaceModal, setShowFaceModal] = useState(false);'
  );

  // Add Face Registration UI under Photo Upload
  content = content.replace(
    /Format:\s*JPG,\s*JPEG,\s*PNG<br\s*\/>Maks\.\s*2MB\s*<\/p>\s*<\/div>/,
    `Format: JPG, JPEG, PNG<br />Maks. 2MB
                </p>
                {/* Face Registration Card */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-center">
                  <div className="text-xs font-semibold text-gray-700 mb-1 flex items-center justify-center gap-1.5">
                    <ScanFace size={15} className="text-blue-600" /> Absensi Wajah
                  </div>
                  <div className="mb-2">
                    {user?.is_face_registered ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✓ Terdaftar
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        ! Belum Terdaftar
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFaceModal(true)}
                    className="w-full py-1.5 px-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
                  >
                    {user?.is_face_registered ? "Perbarui Wajah" : "Daftarkan Wajah"}
                  </button>
                </div>
              </div>`
  );

  // Add Modal at bottom
  content = content.replace(
    /<\/div>\s*\);\s*};\s*export default FormUser;/,
    `      <FaceEnrollmentModal
        isOpen={showFaceModal}
        onClose={() => setShowFaceModal(false)}
        onSuccess={() => {
          refreshProfile?.();
        }}
      />
    </div>
  );
};

export default FormUser;`
  );

  fs.writeFileSync(file, content, 'utf8');
  console.log('FormUser.jsx updated successfully!');
} else {
  console.log('FormUser.jsx already includes FaceEnrollmentModal');
}
