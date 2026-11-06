import React, { useCallback, useRef, useState } from 'react';

// Dashed-border file picker shared by the Excel/CSV import surfaces.
// Owns the hidden input (accept list included) and a drop zone div;
// callers pass their own frame classes via labelClassName and inner copy via
// children, so each page keeps its existing visuals.
// Supports both click-to-select and drag-and-drop.
const ExcelImport = ({ id, onChange, labelClassName, children }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure drop effect is shown
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      // Create a synthetic event that mimics the input's onChange
      const syntheticEvent = {
        target: {
          files: files,
          value: files[0]?.name || ''
        },
        currentTarget: {
          files: files
        },
        preventDefault: () => {},
        stopPropagation: () => {},
        nativeEvent: e
      };
      onChange(syntheticEvent);
    }
  }, [onChange]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e) => {
    onChange(e);
  }, [onChange]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        id={id}
        accept=".xlsx,.xls,.csv"
        onChange={handleInputChange}
        className="hidden"
      />
      <div
        className={`${labelClassName} ${isDragging ? 'ring-2 ring-primary dark:ring-blue-400 bg-primary/5 dark:bg-blue-500/10' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {children}
      </div>
    </>
  );
};

export default ExcelImport;
