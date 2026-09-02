import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

export default function SearchableSelect({
  label,
  options = [],
  value = '',
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search...',
  required = false,
  allowCustom = true,
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Normalize options array into [{ value, label }]
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return { value: opt.value ?? opt.label, label: opt.label ?? opt.value };
    }
    return { value: String(opt), label: String(opt) };
  });

  // Filter options
  const filteredOptions = normalizedOptions.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  // Check if current search term is an exact match
  const hasExactMatch = normalizedOptions.some(
    (opt) => opt.label.toLowerCase() === searchTerm.toLowerCase().trim()
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : value;

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg text-left flex items-center justify-between transition-all shadow-2xs ${
          isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span className={`truncate ${displayLabel ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
          {displayLabel || placeholder}
        </span>

        <div className="flex items-center gap-1.5 ml-2 text-slate-400 shrink-0">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:text-slate-600 rounded-full hover:bg-slate-100"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto p-1 text-xs">
            {filteredOptions.length === 0 ? (
              <div className="py-2.5 px-3 text-center text-slate-400">
                No options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-3 py-2 text-left rounded-lg flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" />}
                  </button>
                );
              })
            )}

            {/* Custom option when user types something not in list */}
            {allowCustom && searchTerm.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={() => handleSelect(searchTerm.trim())}
                className="w-full mt-1 px-3 py-2 text-left rounded-lg text-indigo-600 hover:bg-indigo-50 font-medium border-t border-slate-100 flex items-center gap-1.5"
              >
                <span>+ Use custom:</span>
                <span className="font-semibold text-slate-900 truncate">"{searchTerm.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
