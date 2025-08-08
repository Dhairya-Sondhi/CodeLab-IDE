import { useEffect, useState } from 'react';
import '../../styles/cursors.css'

const CursorManager = ({ editor, socket, roomId, currentUser, connectedUsers }) => {
  const [remoteCursors, setRemoteCursors] = useState(new Map());
  const [isTracking, setIsTracking] = useState(false);
  const [decorationIds, setDecorationIds] = useState([]);

  useEffect(() => {
    if (!editor || !socket) return;

    setIsTracking(true);

    // Throttle cursor updates to avoid spam
    let lastUpdateTime = 0;
    const updateThrottle = 100; // ms

    const handleCursorPositionChange = () => {
      const now = Date.now();
      if (now - lastUpdateTime < updateThrottle) return;
      lastUpdateTime = now;

      const position = editor.getPosition();
      const selection = editor.getSelection();

      // Defensive checks for valid position
      if (position && typeof position.lineNumber === 'number' && typeof position.column === 'number') {
        socket.emit('cursor-position', {
          roomId,
          position: {
            lineNumber: position.lineNumber,
            column: position.column
          },
          user: currentUser
        });
      }

      if (
        selection &&
        !selection.isEmpty() &&
        typeof selection.startLineNumber === 'number' &&
        typeof selection.startColumn === 'number' &&
        typeof selection.endLineNumber === 'number' &&
        typeof selection.endColumn === 'number'
      ) {
        socket.emit('selection-change', {
          roomId,
          selection: {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn
          },
          user: currentUser
        });
      }
    };

    // Listen for editor cursor/selection changes
    const positionListener = editor.onDidChangeCursorPosition(handleCursorPositionChange);
    const selectionListener = editor.onDidChangeCursorSelection(handleCursorPositionChange);

    const handleRemoteCursorPosition = (data) => {
      // Defensive: must have valid data/position
      if (
        !data ||
        !data.position ||
        typeof data.position.lineNumber !== 'number' ||
        typeof data.position.column !== 'number'
      ) return;

      setRemoteCursors(prev => {
        const updated = new Map(prev);
        updated.set(data.userId, {
          ...prev.get(data.userId),
          position: data.position,
          user: data.user,
          timestamp: Date.now()
        });
        return updated;
      });
    };

    const handleRemoteSelection = (data) => {
      // Defensive: must have valid data/selection
      if (
        !data ||
        !data.selection ||
        typeof data.selection.startLineNumber !== 'number' ||
        typeof data.selection.startColumn !== 'number' ||
        typeof data.selection.endLineNumber !== 'number' ||
        typeof data.selection.endColumn !== 'number'
      ) return;

      setRemoteCursors(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.userId) || {};
        updated.set(data.userId, {
          ...existing,
          selection: data.selection,
          user: data.user,
          timestamp: Date.now()
        });
        return updated;
      });
    };

    socket.on('cursor-position', handleRemoteCursorPosition);
    socket.on('selection-change', handleRemoteSelection);

    // Clean up old cursors (users who disconnected)
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const updated = new Map(prev);
        let hasChanges = false;
        for (const [userId, data] of updated.entries()) {
          if (now - (data.timestamp || 0) > 5000) {
            updated.delete(userId);
            hasChanges = true;
          }
        }
        return hasChanges ? updated : prev;
      });
    }, 1000);

    return () => {
      positionListener.dispose();
      selectionListener.dispose();
      socket.off('cursor-position', handleRemoteCursorPosition);
      socket.off('selection-change', handleRemoteSelection);
      clearInterval(cleanupInterval);
      setIsTracking(false);
    };
  }, [editor, socket, roomId, currentUser]);

  // Render cursors using Monaco decorations
  useEffect(() => {
    if (!editor || !isTracking) return;

    // Use window.monaco.Range (This is the crucial fix)
    const Range = window.monaco && window.monaco.Range
      ? window.monaco.Range
      : undefined;

    if (!Range) return; // Monaco not loaded

    const decorations = [];
    const cursorsArray = Array.from(remoteCursors.entries());

    cursorsArray.forEach(([userId, data]) => {
      // Defensive: skip if userId matches self
      if (currentUser && data.user && data.user.id === currentUser.id) return;

      // Defensive: get user (may be disconnected, fallback to last sent info)
      const user = (connectedUsers || []).find(u => u.id === data.user?.id) || data.user || {};
      const color = getUserColor(userId);

      // Add cursor decoration if valid
      if (
        data.position &&
        typeof data.position.lineNumber === 'number' &&
        typeof data.position.column === 'number'
      ) {
        decorations.push({
          range: new Range(
            data.position.lineNumber,
            data.position.column,
            data.position.lineNumber,
            data.position.column
          ),
          options: {
            className: `remote-cursor cursor-${userId.replace(/[^a-zA-Z0-9]/g, '')}`,
            stickiness: 1,
            after: {
              content: ` ${user?.name || user?.email || 'Anonymous'}`,
              inlineClassName: `cursor-name cursor-${userId.replace(/[^a-zA-Z0-9]/g, '')}`
            }
          }
        });
      }

      // Add selection decoration if valid and non-empty
      if (
        data.selection &&
        typeof data.selection.startLineNumber === 'number' &&
        typeof data.selection.startColumn === 'number' &&
        typeof data.selection.endLineNumber === 'number' &&
        typeof data.selection.endColumn === 'number' &&
        (
          data.selection.startLineNumber !== data.selection.endLineNumber ||
          data.selection.startColumn !== data.selection.endColumn
        )
      ) {
        decorations.push({
          range: new Range(
            data.selection.startLineNumber,
            data.selection.startColumn,
            data.selection.endLineNumber,
            data.selection.endColumn
          ),
          options: {
            className: `remote-selection selection-${userId.replace(/[^a-zA-Z0-9]/g, '')}`,
            stickiness: 1
          }
        });
      }
    });

    // Apply decorations
    const newDecorationIds = editor.deltaDecorations(decorationIds, decorations);
    setDecorationIds(newDecorationIds);

    // Inject dynamic CSS for user colors
    injectCursorStyles(cursorsArray);

  }, [remoteCursors, editor, connectedUsers, isTracking, decorationIds, currentUser]);

  // Cleanup decorations on unmount
  useEffect(() => {
    return () => {
      if (editor && decorationIds.length > 0) {
        editor.deltaDecorations(decorationIds, []);
      }
      // Remove cursor styles
      const existingStyle = document.getElementById('cursor-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  return null; // This component doesn't render anything itself
};


// Helper function to generate consistent colors for users
const getUserColor = (userId) => {
  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
    '#eb4d4b', '#6ab04c', '#7bed9f', '#70a1ff', '#5f27cd',
    '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43'
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
};


// Inject CSS styles for cursor colors
const injectCursorStyles = (cursorsArray) => {
  let styles = '';

  cursorsArray.forEach(([userId]) => {
    const color = getUserColor(userId);
    const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, '');

    styles += `
      .cursor-${safeUserId}::after {
        content: '';
        position: absolute;
        width: 2px;
        height: 18px;
        background-color: ${color};
        border-left: 2px solid ${color};
        animation: blink-cursor 1s infinite;
        z-index: 1000;
        pointer-events: none;
      }

      .cursor-name.cursor-${safeUserId} {
        background-color: ${color};
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
        position: absolute;
        transform: translateY(-100%);
        white-space: nowrap;
        z-index: 1001;
        pointer-events: none;
        font-family: 'Monaco', 'Menlo', monospace;
      }

      .selection-${safeUserId} {
        background-color: ${color}33 !important;
        border-radius: 2px;
      }
    `;
  });

  // Remove existing style element and add new one
  const existingStyle = document.getElementById('cursor-styles');
  if (existingStyle) {
    existingStyle.remove();
  }

  if (styles) {
    const styleElement = document.createElement('style');
    styleElement.id = 'cursor-styles';
    styleElement.textContent = `
      @keyframes blink-cursor {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0.3; }
      }
      ${styles}
    `;
    document.head.appendChild(styleElement);
  }
};

export default CursorManager;
