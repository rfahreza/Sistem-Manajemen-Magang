import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function NavUser() {
    const location = useLocation();
    const navigate = useNavigate();
    const [active, setActive] = useState(null);
  
    const handleClick = (id, link) => {
      setActive(id);
      navigate(link);
    };
  
    const item = [
      {
        id: 1,
        name: "Dashboard",
        link: "/dashboardUser",
      },
      {
        id: 2,
        name: "Absensi",
        link: "/absensiUser",
      },
      {
        id: 3,
        name: "Logbook",
        link: "/logbookUser",
      },
      {
        id: 4,
        name: "Laporan",
        link: "/laporanUser",
      },
    ];
  return (
    <div className="md:ml-6 h-full flex flex-col md:flex-row space-x-8">
      {item.map((item) => (
        <div
          key={item.id}
          className={`${location.pathname === item.link || active === item.id
            ? "text-red-500 md:border-b-2 md:border-red-500"
            : "text-gray-500 hover:text-gray-700 duration-500"} px-3 pt-5 cursor-pointer`}
          onClick={() => handleClick(item.id, item.link)}
        >
          {item.name}
        </div>
      ))}
    </div>
  )
}

export default NavUser