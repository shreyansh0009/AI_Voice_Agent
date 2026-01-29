// import PropTypes from "prop-types";

// const Footer = ({ className = "" }) => {
//   const currentYear = new Date().getFullYear();

//   return (
//     <footer className={`bg-linear-to-r from-gray-50 to-gray-100 border-t border-gray-200 ${className}`}>
//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
//         {/* Main Footer Content */}
//         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 mb-6">
//           {/* Brand Section */}
//           <div className="space-y-2 lg:space-y-3">
//             <h3 className="text-base lg:text-lg font-semibold text-gray-800">AI Voice CRM</h3>
//             <p className="text-xs lg:text-sm text-gray-600 leading-relaxed">
//               Empowering your business with intelligent call analytics and management solutions.
//             </p>
//           </div>

//           {/* Quick Links */}
//           <div className="space-y-2 lg:space-y-3">
//             <h4 className="text-xs lg:text-sm font-semibold text-gray-800 uppercase tracking-wide">Quick Links</h4>
//             <ul className="space-y-1 lg:space-y-2">
//               <li>
//                 <a href="#dashboard" className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors">
//                   Dashboard
//                 </a>
//               </li>
//               <li>
//                 <a href="#analytics" className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors">
//                   Analytics
//                 </a>
//               </li>
//               <li>
//                 <a href="#reports" className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors">
//                   Reports
//                 </a>
//               </li>
//               <li>
//                 <a href="#support" className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors">
//                   Support
//                 </a>
//               </li>
//             </ul>
//           </div>

//           {/* Contact Info */}
//           <div className="space-y-2 lg:space-y-3">
//             <h4 className="text-xs lg:text-sm font-semibold text-gray-800 uppercase tracking-wide">Contact</h4>
//             <ul className="space-y-1 lg:space-y-2 text-xs lg:text-sm text-gray-600">
//               <li className="flex items-center gap-2">
//                 <svg className="w-3 h-3 lg:w-4 lg:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
//                 </svg>
//                 <a href="mailto:support@aivoicecrm.com" className="hover:text-blue-500 transition-colors break-all">
//                   support@aivoicecrm.com
//                 </a>
//               </li>
//               <li className="flex items-center gap-2">
//                 <svg className="w-3 h-3 lg:w-4 lg:h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//                 </svg>
//                 <span>(660) 217-4140</span>
//               </li>
//             </ul>
//           </div>
//         </div>

//         {/* Divider */}
//         <div className="border-t border-gray-300 mb-4 lg:mb-6"></div>

//         {/* Bottom Section */}
//         <div className="flex flex-col sm:flex-row justify-between items-center gap-3 lg:gap-4">
//           <p className="text-xs lg:text-sm text-gray-600 text-center sm:text-left">
//             © {currentYear} AI Voice CRM. All rights reserved.
//           </p>
          
//           {/* Social Links */}
//           <div className="flex items-center gap-3 lg:gap-4">
//             <a
//               href="#privacy"
//               className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors"
//               aria-label="Privacy Policy"
//             >
//               Privacy Policy
//             </a>
//             <span className="text-gray-400">•</span>
//             <a
//               href="#terms"
//               className="text-xs lg:text-sm text-gray-600 hover:text-blue-500 transition-colors"
//               aria-label="Terms of Service"
//             >
//               Terms of Service
//             </a>
//           </div>
//         </div>
//       </div>
//     </footer>
//   );
// };

// Footer.propTypes = {
//   className: PropTypes.string,
// };

// export default Footer;
