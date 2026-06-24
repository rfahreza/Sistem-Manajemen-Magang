import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function NavAdmin() {
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
        link: "/dashboard",
      },
      {
        id: 2,
        name: "Internship",
        link: "/internship",
      },
      {
        id: 3,
        name: "Absensi",
        link: "/absensi",
      },
      {
        id: 4,
        name: "Logbook",
        link: "/logbook",
      },
      {
        id: 5,
        name: "Laporan",
        link: "/laporan",
      }
    ];
  return (
    <div className="md:ml-6 h-full flex flex-col md:flex-row space-x-8">
      {item.map((item) => (
        <div
          key={item.id}
          className={`${location.pathname === item.link || active === item.id
            ? "text-red-500 md:border-b-2 md:border-red-500 "
            : "text-gray-500 hover:text-gray-700 duration-500"} px-3 pt-5 cursor-pointer`}
          onClick={() => handleClick(item.id, item.link)}
        >
          {item.name}
        </div>
      ))}
    </div>
  )
}

export default NavAdmin