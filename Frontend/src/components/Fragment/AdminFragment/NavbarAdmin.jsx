import React, { useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import NavAdmin from "../../Elements/Items/NavAdmin";
import { UserCircle, LogOut, ChevronDown, AlignJustify } from "lucide-react";
import { useAuth } from "../../Context/UserContext";

const NavbarAdmin = ({ type }) => {
  const { user, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [toggle, setToggle] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleToggle = () => {
    setToggle(!toggle);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getProfilePhotoUrl = () => {
    if (!user?.photo_profile) return null;
    if (user.photo_profile.startsWith("http")) {
      return user.photo_profile;
    }
    return `${process.env.REACT_APP_API_URL || "http://localhost:3000"}/uploads/profiles/${user.photo_profile}`;
  };

  return (
    <nav className="bg-white z-50 fixed px-8 shadow-md w-full">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between h-16">
          <div className="flex h-full items-center">
            <img src="images/cemenLogo.svg" alt="Logo" className="h-11 w-auto" />
            <div className="ml-6 h-full md:flex space-x-8 hidden">
              <Navigation type={type} location={location} />
            </div>
          </div>

          <div className="md:flex items-center hidden relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center group hover:bg-gray-50 rounded-lg transition-all duration-150 ease-in-out"
            >
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 duration-500">
                    {user?.nama || "Admin"}
                  </span>
                  <span className="text-xs text-gray-500 group-hover:text-gray-700 duration-500">
                    {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1) || "Admin"}
                  </span>
                </div>
                {getProfilePhotoUrl() ? (
                  <img
                    src={getProfilePhotoUrl()}
                    alt="Profile"
                    className="h-9 w-9 rounded-full ring-2 ring-gray-100 duration-500 group-hover:ring-red-300 object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = null;
                      e.target.className = "hidden";
                      e.target.nextSibling.className = "h-9 w-9 rounded-full ring-2 ring-gray-100 duration-500 group-hover:ring-red-200 bg-gray-200 flex items-center justify-center";
                    }}
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full ring-2 ring-gray-100 duration-500 group-hover:ring-red-200 bg-gray-200 flex items-center justify-center">
                    <UserCircle className="h-6 w-6 text-gray-500" />
                  </div>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform duration-500 ${
                    isDropdownOpen ? "transform rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            <div
              className={`absolute right-0 top-full mt-1 w-60 rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 transform transition-all duration-500 ease-in-out ${
                isDropdownOpen ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-2 invisible"
              }`}
            >
              <div className="p-2">
                <div className="text-xs font-medium text-gray-400 px-3 py-2">
                  Account Settings
                </div>
                <Link
                  to="/profile"
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                    location.pathname === "/profile" ? "text-red-500 border-b-2 border-red-500" : "text-gray-700 hover:bg-blue-50 duration-500 transition-colors"
                  }`}
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
                    <UserCircle className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">Edit Profile</span>
                    <span className="text-xs text-gray-500">Manage your account</span>
                  </div>
                </Link>
                <div className="h-px bg-gray-100 my-2"></div>
                <button
                  onClick={() => {
                    handleLogout();
                    setIsDropdownOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 duration-500 transition-colors"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600">
                    <LogOut className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Log Out</span>
                    <span className="text-xs text-red-500">End your session</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex justify-between items-center w-full">
            <div className="bg-white shadow ml-auto px-[12px] py-[12px] rounded-md">
              <AlignJustify onClick={handleToggle} className="h-5 w-5 text-gray-800" />
            </div>
          </div>

          {/* Mobile menu */}
          <div
            className={`absolute shadow text-end justify-end items-end cursor-pointer mr-[32px] rounded-lg top-20 right-0 bg-white z-50 flex flex-col px-5 pb-5 transition-all duration-500 ease-in-out ${
              toggle ? "opacity-100 translate-y-0 visible" : "opacity-0 -translate-y-2 invisible"
            }`}
          >
            <Navigation type={type} location={location} />
            {/* Mobile Edit Profile and Logout buttons */}
            <Link
              to="/profile"
              className={`flex items-center gap-3 px-3 py-3 rounded-lg mt-2 ${
                location.pathname === "/profile" ? "text-red-500" : "text-gray-500"
              }`}
              onClick={() => setToggle(false)}
            >
              <span className="font-medium hover:text-gray-700 duration-500">Edit Profile</span>
            </Link>

            <button
              onClick={() => {
                handleLogout();
                setToggle(false);
              }}
              className="flex items-center gap-3 px-3 py-2 text-gray-500 hover:text-gray-700 duration-500"
            >
              <span className="font-medium">Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

const Navigation = ({ type }) => {
  if (type === "dashboard") {
    return <NavAdmin />;
  } else if (type === "internship") {
    return <NavAdmin />;
  } else if (type === "absensi") {
    return <NavAdmin />;
  } else if (type === "logbook") {
    return <NavAdmin />;
  } else {
    return <NavAdmin />;
  }
};

export default NavbarAdmin;
