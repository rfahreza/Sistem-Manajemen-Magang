import React, { useState, useEffect } from "react";
import { ReactTyped } from "react-typed";

function Title() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const mobileStrings = [
    "SISTEM MANAGEMENT\nMAGANG",
    "SEMEN PADANG"
  ];

  const desktopStrings = [
    "SISTEM MANAGEMENT MAGANG",
    "SEMEN PADANG"
  ];

  return (
    <div className="text-center px-4 mb-8">
      <ReactTyped
        className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-red-500"
        strings={isMobile ? mobileStrings : desktopStrings}
        typeSpeed={100}
        backSpeed={100}
        loop
        style={{ whiteSpace: 'pre-line', lineHeight: '1.2' }}
      />
    </div>
  );
}

export default Title;