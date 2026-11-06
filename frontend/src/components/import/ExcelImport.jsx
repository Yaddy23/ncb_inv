import React, { useCallback, useState } from 'react';

// Dashed-border file picker shared by the Excel/CSV import surfaces.
// Owns the hidden input (accept list included) and its label; callers
// pass their own frame classes via labelClassName and inner copy via
// children, so each page keeps its existing visuals.
// Supports both click-to-select and drag-and-drop.
const ExcelImport = ({ id, onChange, labelClassName, children }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Create a synthetic event that mimics the input's onChange
      const syntheticEvent = {
        target: {
          files: files
        }
      };
      onChange(syntheticEvent);
    }
  }, [onChange]);

  return (
    <>
      <input
        type="file"
        id={id}
        accept=".xlsx,.xls,.csv"
        onChange={onChange}
        className="hidden"
      />
      <label
        htmlFor={id}
        className={`${labelClassName} ${isDragging ? 'ring-2 ring-primary dark:ring-blue-400' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {children}
      </label>
    </>
  );
};

export default ExcelImport;
