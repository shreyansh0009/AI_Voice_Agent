import { useState } from "react";
import MetricCard from "../components/MetricCard";
import NumbersAnalyticsCard from "../components/NumbersAnalyticsCard";
import VoicemailAnalyticsCard from "../components/VoicemailAnalyticsCard";
import PostCallSurveyCard from "../components/PostCallSurveyCard";
import PostCallSurveyAnalyticsCard from "../components/PostCallSurveyAnalyticsCard";
import CallDispositionAnalyticsCard from "../components/CallDispositionAnalyticsCard";
import BusyHoursCard from "../components/BusyHoursCard";
import AITestComponent from "../components/AITestComponent";
import CallDialer from "../components/CallDialer";
import CallHistory from "../components/CallHistory";
import { MdOutlineSpeed } from "react-icons/md";
import { BiPhone, BiPhoneCall, BiPhoneIncoming, BiPhoneOff, BiChevronDown } from "react-icons/bi";
import { AiOutlineClockCircle, AiOutlineClose } from "react-icons/ai";
import { IoIosInformationCircleOutline } from "react-icons/io";
import { HiBolt, HiArrowUp } from "react-icons/hi2";

function Dashboard() {
  const [activeTab, setActiveTab] = useState("live");
  const [teamMember, setTeamMember] = useState("you");
  const [duration, setDuration] = useState("last-7-days");
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [number, setNumber] = useState(null);
  const [analyticsTab, setAnalyticsTab] = useState("call");

  const chartData = [
    { date: "2025-10-22", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-23", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-24", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-25", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-26", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-27", outbound: 0, inbound: 0, missed: 0 },
    { date: "2025-10-28", outbound: 0, inbound: 0, missed: 0 },
  ];

  const metricsData = [
    {
      icon: <MdOutlineSpeed className="text-blue-500" />,
      value: "0%",
      label: "Service Level",
      trend: "0",
      trendDirection: "up",
    },
    {
      icon: <BiPhone className="text-cyan-500" />,
      value: "0",
      label: "Calls Made",
      trend: "0",
      trendDirection: "down",
    },
    {
      icon: <BiPhoneCall className="text-green-500" />,
      value: "0",
      label: "Calls Answered",
      trend: "0",
      trendDirection: "up",
    },
    {
      icon: <AiOutlineClockCircle className="text-yellow-500" />,
      value: "TBA",
      label: "Avg. Answer Time",
      trend: "0",
      trendDirection: "up",
    },
    {
      icon: <BiPhoneIncoming className="text-red-500" />,
      value: "0",
      label: "Calls outside office hours",
      trend: "0",
      trendDirection: "down",
    },
    {
      icon: <BiPhoneOff className="text-orange-500" />,
      value: "0",
      label: "Calls not picked by agent",
      trend: "0",
      trendDirection: "down",
    },
    {
      icon: <AiOutlineClose className="text-red-500" />,
      value: "0",
      label: "Calls abandoned before ringing",
      trend: "0",
      trendDirection: "down",
    },
  ];

  const numbersData = [
    {
      number: "(660) 217-4140",
      flag: "🇺🇸",
      outbound: 0,
      inbound: 0,
      missed: 0,
    },
  ];

  const numbersColumns = [
    {
      header: "Number",
      key: "number",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-xl">{row.flag}</span>
          <span className="font-medium">{row.number}</span>
        </div>
      ),
    },
    {
      header: "Outbound",
      key: "outbound",
    },
    {
      header: "Inbound",
      key: "inbound",
    },
    {
      header: "Missed",
      key: "missed",
    },
  ];

  const teamMemberData = [
    {
      name: "Ankit Panwar",
      avatar: "👤",
      status: "online",
      statusColor: "green",
      lastLoginTime: "since 12 minutes ago",
      availability: "Available",
      outbound: 0,
      inbound: 0,
      availableTime: "6day 10hr 55min 51sec",
    },
  ];

  const teamMemberColumns = [
    {
      header: "Name",
      key: "name",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-white text-lg">
            {row.avatar}
          </div>
          <div>
            <div className="font-medium whitespace-nowrap">{row.name}</div>
            <span className="inline-block mt-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
              {row.availability}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Last Login",
      key: "lastLogin",
      render: (row) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="font-medium">{row.status}</span>
          </div>
          <span className="text-xs text-gray-500">{row.lastLoginTime}</span>
        </div>
      ),
    },
    {
      header: "Outbound",
      key: "outbound",
      render: (row) => <div className="text-center">{row.outbound}</div>,
    },
    {
      header: "Inbound",
      key: "inbound",
      render: (row) => <div className="text-center">{row.inbound}</div>,
    },
    {
      header: "Available time",
      key: "availableTime",
      render: (row) => <div className="whitespace-nowrap">{row.availableTime}</div>,
    },
  ];

  const postCallSurveyData = [
    {
      number: "(660) 217-4140",
      flag: "🇺🇸",
      averageRating: 0,
    },
  ];

  const postCallSurveyColumns = [
    {
      header: "Number",
      key: "number",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-xl">{row.flag}</span>
          <span className="font-medium">{row.number}</span>
        </div>
      ),
    },
    {
      header: "Average Rating",
      key: "averageRating",
      render: () => (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <span key={star} className="text-yellow-400 text-lg">
              ☆
            </span>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="h-full overflow-auto">
        <div className="bg-linear-to-br from-white to-gray-50 shadow-lg rounded-xl border border-gray-100 m-3 lg:m-6 overflow-hidden hover:shadow-xl transition-shadow duration-300">
          <div className="flex flex-col lg:flex-row h-full">
            <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-gray-200 p-4 lg:p-6 bg-linear-to-br from-blue-50 to-white">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full border-2 border-blue-400 flex items-center justify-center mr-3 bg-white shadow-md hover:shadow-lg transition-all duration-300 hover:scale-110">
                  <HiBolt className="text-blue-500 text-2xl" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                    Live Calls
                    <span className="ml-2 w-5 h-5 bg-gray-800 text-white text-xs rounded flex items-center justify-center hover:bg-gray-700 cursor-pointer transition-colors">
                      ?
                    </span>
                  </h2>
                </div>
              </div>

              <div className="text-center">
                <div className="text-6xl font-light mb-6 bg-linear-to-br from-blue-600 to-blue-400 bg-clip-text text-transparent">0</div>

                <div className="flex justify-between text-center">
                  <div className="flex-1 border-r border-gray-200">
                    <div className="text-sm text-cyan-500 mb-1 font-medium">Outbound</div>
                    <div className="text-3xl font-light text-gray-800">0</div>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-cyan-500 mb-1 font-medium">Answered</div>
                    <div className="text-3xl font-light text-gray-800">0</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="border-b border-gray-200 px-4 lg:px-6 bg-white">
                <div className="flex space-x-4 lg:space-x-8 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab("live")}
                    className={`py-4 px-1 border-b-2 font-medium text-xs lg:text-sm whitespace-nowrap transition-all duration-200 ${
                      activeTab === "live"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    Live Calls
                  </button>
                  <button
                    onClick={() => setActiveTab("recent")}
                    className={`py-4 px-1 border-b-2 font-medium text-xs lg:text-sm whitespace-nowrap transition-all duration-200 ${
                      activeTab === "recent"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    onClick={() => setActiveTab("queue")}
                    className={`py-4 px-1 border-b-2 font-medium text-xs lg:text-sm whitespace-nowrap transition-all duration-200 ${
                      activeTab === "queue"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    Callers in Queue
                  </button>
                  <button
                    onClick={() => setActiveTab("phoneCalls")}
                    className={`py-4 px-1 border-b-2 font-medium text-xs lg:text-sm whitespace-nowrap transition-all duration-200 ${
                      activeTab === "phoneCalls"
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    📞 Phone Calls
                  </button>
                </div>
              </div>

              <div className="p-6 lg:p-12 min-h-[200px] lg:min-h-[300px]">
                {activeTab === "phoneCalls" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CallDialer agents={[
                      { id: 'default', name: 'Default Agent' },
                      { id: 'sales', name: 'Sales Agent' },
                      { id: 'support', name: 'Support Agent' }
                    ]} />
                    <CallHistory />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center transform hover:scale-105 transition-transform duration-300">
                      <div className="w-24 h-24 lg:w-32 lg:h-32 mx-auto mb-4 rounded-full bg-linear-to-br from-gray-50 to-gray-100 flex items-center justify-center shadow-inner">
                        <BiPhone className="text-gray-300 text-5xl lg:text-6xl" />
                      </div>
                      <p className="text-gray-400 font-medium text-sm lg:text-base">
                        No Live Activities
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 lg:p-6">
          <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300">
            <div className="flex flex-col lg:flex-row">
              <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-gray-200 p-6 lg:p-8 flex items-center justify-center bg-linear-to-br from-gray-50 to-white">
                <div className="text-center transform hover:scale-105 transition-transform duration-300">
                  <div className="w-24 h-24 lg:w-32 lg:h-32 mx-auto mb-4 rounded-full bg-linear-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-inner">
                    <IoIosInformationCircleOutline className="text-gray-300 text-5xl lg:text-6xl" />
                  </div>
                  <p className="text-gray-400 font-medium text-sm lg:text-base">
                    No Call Activities
                  </p>
                </div>
              </div>

              <div className="flex-1 p-4 lg:p-6">
                <div className="flex flex-col lg:flex-row justify-end items-start lg:items-center mb-6 gap-3 lg:gap-0">
                  <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 w-full lg:w-auto">
                    <div className="w-full sm:w-auto">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">
                        Team Members
                      </label>
                      <select
                        value={teamMember}
                        onChange={(e) => setTeamMember(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                      >
                        <option value="you">You</option>
                        <option value="all">All Members</option>
                      </select>
                    </div>
                    <div className="w-full sm:w-auto">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">
                        Duration
                      </label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full lg:w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
                      >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last-7-days">Last 7 days</option>
                        <option value="last-30-days">Last 30 days</option>
                        <option value="past-month">Past month</option>
                      </select>
                    </div>
                    <button className="w-full sm:w-auto bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 h-8 mt-0 lg:mt-4 cursor-pointer rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105">
                      Download Report
                    </button>
                  </div>
                </div>

                <div className="relative h-64 border-b-2 border-blue-500 rounded-b-lg">
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 pr-2 font-medium">
                    <span>1</span>
                    <span>0.75</span>
                    <span>0.5</span>
                    <span>0.25</span>
                    <span>0</span>
                  </div>

                  <div className="ml-8 h-full relative">
                    <div className="absolute inset-0 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="border-t border-gray-100"></div>
                      ))}
                    </div>

                    <div className="absolute inset-0 flex items-end justify-around px-2">
                      {chartData.map((point, index) => (
                        <div
                          key={index}
                          className="flex flex-col items-center relative cursor-pointer"
                          onMouseEnter={() => setHoveredPoint(index)}
                          onMouseLeave={() => setHoveredPoint(null)}
                        >
                          <div
                            className={`w-3 h-3 rounded-full mb-1 transition-all duration-300 shadow-md ${
                              hoveredPoint === index
                                ? "bg-blue-600 scale-150 shadow-lg"
                                : "bg-blue-500 hover:scale-125"
                            }`}
                          ></div>

                          {hoveredPoint === index && (
                            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-xs whitespace-nowrap z-10 animate-fadeIn">
                              <div className="font-semibold mb-2">
                                {point.date}
                              </div>
                              <div className="text-cyan-500">
                                Outbound Calls: {point.outbound}
                              </div>
                              <div className="text-cyan-500">
                                Inbound Calls: {point.inbound}
                              </div>
                              <div className="text-red-500">
                                Missed Calls: {point.missed}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ml-8 mt-2 flex justify-around text-[10px] sm:text-xs text-gray-500 font-medium overflow-hidden">
                    <span className="truncate">2025-10-22</span>
                    <span className="truncate">2025-10-23</span>
                    <span className="truncate">2025-10-24</span>
                    <span className="truncate">2025-10-25</span>
                    <span className="truncate">2025-10-26</span>
                    <span className="truncate">2025-10-27</span>
                    <span className="truncate">2025-10-28</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 lg:p-6 bg-linear-to-br from-gray-50 to-white">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:row-span-2">
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 h-full flex flex-col justify-center hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <div className="text-center">
                  <div className="text-5xl mb-2 flex justify-center">
                    <MdOutlineSpeed className="text-blue-500" />
                  </div>
                  <div className="flex items-center justify-center mb-2">
                    <HiArrowUp className="text-green-500 text-xl" />
                    <span className="text-5xl font-light text-gray-800 ml-2">
                      0%
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mb-3 font-medium">
                    Service Level
                  </div>
                  <div className="text-xs text-gray-400 border-t pt-3">
                    Percentage of incoming calls answered in less than
                    <select className="border border-gray-300 rounded-lg px-2 py-1 mx-1 text-xs hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all">
                      <option>30</option>
                      <option>60</option>
                      <option>90</option>
                    </select>
                    seconds.
                  </div>
                </div>
              </div>
            </div>

            {metricsData.slice(1).map((metric, index) => (
              <MetricCard
                key={index}
                icon={metric.icon}
                value={metric.value}
                label={metric.label}
                trend={metric.trend}
                trendDirection={metric.trendDirection}
              />
            ))}
          </div>
        </div>

        <div className="p-3 lg:p-6">
          <div className="bg-white rounded-xl shadow-lg p-4 lg:p-6 hover:shadow-xl transition-shadow duration-300">
            <div className="flex flex-col lg:flex-row items-start justify-between mb-4 gap-3">
              <h3 className="text-base lg:text-lg font-semibold text-gray-700">
                Justcall Number Analytics
              </h3>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:gap-4 w-full lg:w-auto">
                <div className="w-full sm:w-auto">
                  <label className="block text-xs text-gray-500 mb-1 font-medium">
                    JustCall number
                  </label>
                  <select
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="w-full lg:w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  >
                    <option value="numbers">Numbers</option>
                    <option value="(660) 217-4140">(660) 217-4140</option>
                  </select>
                </div>

                <button className="w-full sm:w-auto bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 cursor-pointer mt-0 lg:mt-4 rounded-lg text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105">
                  Download Report
                </button>
              </div>
            </div>

            <div className="border-b border-gray-200 mb-6">
              <div className="flex space-x-4 lg:space-x-6 overflow-x-auto">
                <button
                  onClick={() => setAnalyticsTab("call")}
                  className={`py-3 text-xs lg:text-sm border-b-2 cursor-pointer font-medium transition-all duration-200 whitespace-nowrap ${
                    analyticsTab === "call"
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Call Analytics
                </button>
                <button
                  onClick={() => setAnalyticsTab("missed")}
                  className={`py-3 text-xs lg:text-sm border-b-2 cursor-pointer font-medium transition-all duration-200 whitespace-nowrap ${
                    analyticsTab === "missed"
                      ? "border-red-500 text-red-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Missed Call Analytics
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row">
              <div className="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-dashed border-gray-300 p-6 lg:p-8 flex items-center justify-center">
                <div className="text-center transform hover:scale-105 transition-transform duration-300">
                  <div className="w-24 h-24 lg:w-32 lg:h-32 mx-auto mb-4 rounded-full bg-linear-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-inner">
                    <IoIosInformationCircleOutline className="text-gray-300 text-5xl lg:text-6xl" />
                  </div>
                  <p className="text-gray-400 font-medium text-sm lg:text-base">
                    No Call Activities
                  </p>
                </div>
              </div>

              <div className="flex-1 p-4 lg:p-6">
                <div
                  className={`relative h-64  border-b-2 rounded-b-lg ${
                    analyticsTab === "missed"
                      ? "border-red-500"
                      : "border-blue-500"
                  }`}
                >
                  <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 pr-2 font-medium">
                    <span>1</span>
                    <span>0.75</span>
                    <span>0.5</span>
                    <span>0.25</span>
                    <span>0</span>
                  </div>

                  <div className="ml-8 h-full relative">
                    <div className="absolute inset-0 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="border-t border-gray-100"></div>
                      ))}
                    </div>

                    <div className="absolute inset-0 flex items-end justify-around px-2">
                      {chartData.map((point, index) => (
                        <div
                          key={index}
                          className="flex flex-col items-center relative cursor-pointer"
                          onMouseEnter={() => setHoveredPoint(index)}
                          onMouseLeave={() => setHoveredPoint(null)}
                        >
                          <div
                            className={`w-3 h-3 rounded-full mb-1 transition-all duration-300 shadow-md ${
                              hoveredPoint === index
                                ? analyticsTab === "missed"
                                  ? "bg-red-600 scale-150 shadow-lg"
                                  : "bg-blue-600 scale-150 shadow-lg"
                                : analyticsTab === "missed"
                                ? "bg-red-500 hover:scale-125"
                                : "bg-blue-500 hover:scale-125"
                            }`}
                          ></div>

                          {hoveredPoint === index && (
                            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 shadow-xl p-3 rounded-lg text-center text-xs whitespace-nowrap z-10 animate-fadeIn">
                              <div className="font-semibold mb-2">
                                {point.date}
                              </div>
                              {analyticsTab === "missed" ? (
                                <>
                                  <div className="text-orange-400 mb-1">
                                    Calls not picked by agent: 0
                                  </div>
                                  <div className="text-red-600 mb-1">
                                    Abandoned Before Ringing: 0
                                  </div>
                                  <div className="text-amber-900">
                                    After Office Hours: 0
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="text-cyan-500">
                                    Outbound Calls: {point.outbound}
                                  </div>
                                  <div className="text-cyan-500">
                                    Inbound Calls: {point.inbound}
                                  </div>
                                  <div className="text-red-500">
                                    Missed Calls: {point.missed}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ml-8 mt-2 flex justify-around text-[10px] sm:text-xs text-gray-500 font-medium overflow-hidden">
                    <span className="truncate">2025-10-22</span>
                    <span className="truncate">2025-10-23</span>
                    <span className="truncate">2025-10-24</span>
                    <span className="truncate">2025-10-25</span>
                    <span className="truncate">2025-10-26</span>
                    <span className="truncate">2025-10-27</span>
                    <span className="truncate">2025-10-28</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-6 border-t border-gray-200 pt-4">
              <button className="text-blue-500 text-sm inline-flex items-center gap-1 hover:text-blue-600 font-medium transition-colors duration-200 hover:gap-2">
                View Details <BiChevronDown className="transition-transform duration-200" />
              </button>
            </div>
          </div>
        </div>


        <div className="p-3 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <NumbersAnalyticsCard
              title="Numbers Analytics"
              searchPlaceholder="Search phone numbers"
              data={numbersData}
              columns={numbersColumns}
            />

            <NumbersAnalyticsCard
              title="Team Member Analytics"
              searchPlaceholder="Search team members"
              data={teamMemberData}
              columns={teamMemberColumns}
            />
          </div>
        </div>

        <div className="p-3 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <VoicemailAnalyticsCard />

            <PostCallSurveyCard
              data={postCallSurveyData}
              columns={postCallSurveyColumns}
            />
          </div>
        </div>

        <div className="p-3 lg:p-6">
          <PostCallSurveyAnalyticsCard />
        </div>

        <div className="p-3 lg:p-6">
          <CallDispositionAnalyticsCard />
        </div>

        <div className="p-3 lg:p-6">
          <BusyHoursCard />
        </div>

        {/* AI Testing Section */}
        <div className="p-3 lg:p-6">
          <AITestComponent />
        </div>
        
      </div>
    </>
  );
}

export default Dashboard;
