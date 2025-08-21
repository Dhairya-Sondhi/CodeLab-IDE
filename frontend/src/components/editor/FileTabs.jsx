// src/components/editor/FileTabs.jsx
import React, { useState } from 'react';
import './FileTabs.css';

const FileTabs = ({
  files,
  activeFile,
  onFileSelect,
  onFileClose,
  onNewFile,
  onBulkCreateFiles
}) => {
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  const handleBulkCreate = () => {
    const fileList = bulkInput
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
    
    if (fileList.length > 0) {
      onBulkCreateFiles(fileList);
      setBulkInput('');
      setShowBulkDialog(false);
    }
  };

  return (
    <div className="file-tabs-container">
      <div className="file-tabs-list">
        {Object.keys(files).map(name => (
          <div
            key={name}
            className={`file-tab ${activeFile === name ? 'active' : ''}`}
            onClick={() => onFileSelect(name)}
          >
            <span className="file-tab-name">{name}</span>
            {Object.keys(files).length > 1 && (
              <button
                className="file-tab-close"
                onClick={e => {
                  e.stopPropagation();
                  onFileClose(name);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      
      <div className="file-creation-buttons">
        <button className="new-file-button" onClick={onNewFile}>
          + New
        </button>
        <button className="bulk-create-button" onClick={() => setShowBulkDialog(true)}>
          📁 Bulk Add
        </button>
      </div>

      {showBulkDialog && (
        <div className="bulk-dialog-overlay">
          <div className="bulk-dialog">
            <h3>Create Multiple Files</h3>
            <p>Enter file names (one per line):</p>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="index.html&#10;styles.css&#10;script.js&#10;main.py&#10;utils.cpp"
              rows={8}
              className="bulk-textarea"
            />
            <div className="bulk-dialog-buttons">
              <button onClick={handleBulkCreate} className="create-button">
                Create Files ({bulkInput.split('\n').filter(n => n.trim()).length})
              </button>
              <button onClick={() => setShowBulkDialog(false)} className="cancel-button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileTabs;
