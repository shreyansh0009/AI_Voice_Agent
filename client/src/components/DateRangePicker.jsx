import React, { useState, useRef, useEffect } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const DateRangePicker = ({ dateFrom, dateTo, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [startDate, setStartDate] = useState(dateFrom || null);
    const [endDate, setEndDate] = useState(dateTo || null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [error, setError] = useState('');
    const pickerRef = useRef(null);

    // Close picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Get previous month
    const getPreviousMonth = () => {
        const prev = new Date(currentMonth);
        prev.setMonth(prev.getMonth() - 1);
        return prev;
    };

    // Navigate to previous month (can't go to future)
    const handlePrevMonth = () => {
        const prev = getPreviousMonth();
        setCurrentMonth(prev);
    };

    // Navigate to next month (can't exceed current month)
    const handleNextMonth = () => {
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() + 1);
        const today = new Date();

        // Don't allow navigation beyond current month
        // Compare year first, then month
        if (next.getFullYear() < today.getFullYear() ||
            (next.getFullYear() === today.getFullYear() && next.getMonth() <= today.getMonth())) {
            setCurrentMonth(next);
        }
    };

    // Check if can navigate to next month
    const canNavigateNext = () => {
        const next = new Date(currentMonth);
        next.setMonth(next.getMonth() + 1);
        const today = new Date();

        // Can navigate if next month is before or equal to current month
        // Compare year first, then month
        return next.getFullYear() < today.getFullYear() ||
            (next.getFullYear() === today.getFullYear() && next.getMonth() <= today.getMonth());
    };

    // Handle date selection
    const handleDateClick = (date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Don't allow future dates
        if (date > today) return;

        if (!startDate || (startDate && endDate)) {
            // Start new selection
            setStartDate(date);
            setEndDate(null);
            setError('');
        } else {
            // Complete the range
            if (date < startDate) {
                setEndDate(startDate);
                setStartDate(date);
            } else {
                setEndDate(date);
            }

            // Check if range exceeds 30 days
            const start = date < startDate ? date : startDate;
            const end = date < startDate ? startDate : date;
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 30) {
                setError('Date range cannot exceed 31 days. Use APIs to calculate larger data.');
            } else {
                setError('');
            }
        }
    };

    // Apply the selected range
    const handleApply = () => {
        if (startDate && endDate && !error) {
            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            onChange({
                dateFrom: formatDate(startDate),
                dateTo: formatDate(endDate)
            });
            setIsOpen(false);
        }
    };

    // Render calendar for a specific month
    const renderCalendar = (month) => {
        const year = month.getFullYear();
        const monthIndex = month.getMonth();
        const firstDay = new Date(year, monthIndex, 1);
        const lastDay = new Date(year, monthIndex + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Add previous month's days
        const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            days.push(
                <div key={`prev-${day}`} className="w-8 h-8 flex items-center justify-center text-gray-300 text-sm">
                    {day}
                </div>
            );
        }

        // Add current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, monthIndex, day);
            date.setHours(0, 0, 0, 0);
            const isFuture = date > today;
            const isStart = startDate && date.getTime() === startDate.getTime();
            const isEnd = endDate && date.getTime() === endDate.getTime();
            const isInRange = startDate && endDate && date >= startDate && date <= endDate;

            let className = 'w-8 h-8 flex items-center justify-center text-sm cursor-pointer rounded-lg transition-colors';

            if (isFuture) {
                className += ' text-gray-300 cursor-not-allowed';
            } else if (isStart || isEnd) {
                className += ' bg-blue-600 text-white font-semibold';
            } else if (isInRange) {
                className += ' bg-blue-50 text-blue-600';
            } else {
                className += ' text-gray-900 hover:bg-gray-100';
            }

            days.push(
                <div
                    key={`current-${day}`}
                    className={className}
                    onClick={() => !isFuture && handleDateClick(date)}
                >
                    {day}
                </div>
            );
        }

        return (
            <div className="flex-1 px-2">
                <h3 className="text-center font-semibold text-base mb-3">
                    {monthNames[monthIndex]} {year}
                </h3>
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {dayNames.map(day => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {days}
                </div>
            </div>
        );
    };

    // Format display text
    const getDisplayText = () => {
        if (dateFrom && dateTo) {
            return `${dateFrom} to ${dateTo}`;
        }
        return 'Pick a date';
    };

    return (
        <div className="relative" ref={pickerRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center gap-2 text-gray-700"
            >
                <FiCalendar className="text-gray-400" />
                <span className="flex-1 text-left">{getDisplayText()}</span>
            </button>

            {/* Dropdown Calendar */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 p-4 max-w-2xl w-max">
                    {/* Navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <FiChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleNextMonth}
                            disabled={!canNavigateNext()}
                            className={`p-2 rounded-lg transition-colors ${canNavigateNext() ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed'
                                }`}
                        >
                            <FiChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Dual Calendars */}
                    <div className="flex gap-4">
                        {renderCalendar(getPreviousMonth())}
                        <div className="w-px bg-gray-200"></div>
                        {renderCalendar(currentMonth)}
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {/* Apply Button */}
                    <button
                        onClick={handleApply}
                        disabled={!startDate || !endDate || !!error}
                        className={`w-full mt-4 py-3 rounded-lg font-medium text-white transition-colors ${!startDate || !endDate || !!error
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        Apply
                    </button>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
