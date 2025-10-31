import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MdDashboard, MdCall, MdContacts, MdBarChart, MdSettings } from 'react-icons/md';
import { IoPeopleSharp } from "react-icons/io5";
import { IoAnalyticsSharp } from "react-icons/io5";
import { MdPhoneCallback } from "react-icons/md";
import { IoIosGitNetwork } from "react-icons/io";
import { HiOutlineMail } from "react-icons/hi";
import { HiMicrophone } from 'react-icons/hi';
import { FaBullseye } from 'react-icons/fa';
import { CgDialpad } from "react-icons/cg";
import { BsStars } from "react-icons/bs";
import { HiMenuAlt3, HiX } from 'react-icons/hi';
import Footer from './Footer';


function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: MdDashboard },
    { id: 'analytics', label: 'Analytics', path: '/analytics', icon: IoAnalyticsSharp },
    { id: 'voice-agent', label: 'AI Voice Agent', path: '/voice', icon: HiMicrophone },
    { id: 'phone', label: 'Phone Numbers', path: '/phones', icon: MdCall },
    { id: 'workflow', label: 'Workflows', path: '/workflows', icon: IoIosGitNetwork },
    { id: 'salesdialer', label: 'Sales Dialer', path: '/salesdialer', icon: CgDialpad },
    { id: 'crmai', label: 'CRM AI', path: '/crmai', icon: BsStars },
    { id: 'email', label: 'Email Inbox', path: '/email', icon: HiOutlineMail },
    { id: 'teams', label: 'Teams', path: '/teams', icon: IoPeopleSharp },
    { id: 'contacts', label: 'Contacts', path: '/contacts', icon: MdContacts },
    { id: 'call', label: 'Call Logs', path: '/logs', icon: MdPhoneCallback },
    { id: 'leads', label: 'Leads', path: '/leads', icon: FaBullseye },
    { id: 'reports', label: 'Reports', path: '/reports', icon: MdBarChart },
    { id: 'settings', label: 'Settings', path: '/settings', icon: MdSettings },
  ];

  const isActive = (path) => location.pathname === path;

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
      <aside className={`w-64 bg-white shadow-lg flex flex-col border-r border-gray-200 overflow-hidden fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
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
                className={`w-full flex items-center px-6 py-3 cursor-pointer transition-colors text-sm ${
                  isActive(item.path)
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
      </aside>

      
      <main className="flex-1 overflow-auto bg-gray-50 w-full lg:w-auto">
        {children}
        <Footer />
      </main>
    </div>
  );
}

export default Layout;
