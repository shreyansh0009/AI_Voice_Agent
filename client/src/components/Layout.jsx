import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdCall, MdSettings } from 'react-icons/md';
import { SlCallIn } from "react-icons/sl";
import { IoIosGitNetwork } from "react-icons/io";
import { HiMicrophone } from 'react-icons/hi';
import { CiBoxes } from "react-icons/ci";
import { HiMenuAlt3, HiX } from 'react-icons/hi';
import { TbDatabaseCog } from "react-icons/tb";
import { FaUserGear } from "react-icons/fa6";
import { FiLogOut, FiChevronUp } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const menuItems = [
    { id: 'voice-agent', label: 'AI Voice Agent', path: '/voice', icon: HiMicrophone },
    { id: 'callHistory', label: 'Call History', path: '/callHistory', icon: SlCallIn },
    { id: 'phone', label: 'Phone Numbers', path: '/phones', icon: MdCall },
    { id: 'knowledgeBase', label: 'Knowledge Base', path: '/knowledgeBase', icon: TbDatabaseCog },
    //{ id: 'workflow', label: 'Workflows', path: '/workflows', icon: IoIosGitNetwork },
    { id: 'providers', label: 'Providers', path: '/providers', icon: CiBoxes },
    { id: 'workplace', label: 'Workplace', path: '/workplace', icon: FaUserGear },
   // { id: 'settings', label: 'Settings', path: '/settings', icon: MdSettings },
  ];

  const isActive = (path) => location.pathname === path;

  // Close user menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Get user display name and initials
  const displayName = user?.name || user?.email || 'User';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex h-screen">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <HiX className="text-2xl text-gray-800" />
        ) : (
          <HiMenuAlt3 className="text-2xl text-gray-800" />
        )}
      </button>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-white shadow-lg flex flex-col border-r border-gray-200 overflow-hidden fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>

        <div className="p-6 border-b border-gray-200">
          <h1 className="font-bold text-lg text-gray-800">
            CRM Voice Agent
          </h1>
        </div>


        <nav className="flex-1 py-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center px-6 py-3 cursor-pointer transition-colors text-sm ${isActive(item.path)
                    ? 'text-indigo-600 bg-indigo-50 border-r-4 border-indigo-600 font-medium'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
              >
                <Icon className="text-xl" />
                <span className="ml-3">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Profile & Logout at bottom */}
        <div className="border-t border-gray-200 relative" ref={userMenuRef}>
          {/* Logout popup — appears above the user button */}
          {isUserMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <FiLogOut size={16} />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            {/* Name & Email */}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
              {user?.email && user?.name && (
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              )}
            </div>
            <FiChevronUp
              className={`text-gray-400 shrink-0 transition-transform ${isUserMenuOpen ? '' : 'rotate-180'}`}
              size={16}
            />
          </button>
        </div>
      </aside>


      <main className="flex-1 overflow-auto bg-gray-50 w-full lg:w-auto">
        {children}
      </main>
    </div>
  );
}

export default Layout;
